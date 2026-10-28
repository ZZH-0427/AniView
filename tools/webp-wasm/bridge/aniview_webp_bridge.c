#include <stdint.h>
#include <stdlib.h>
#include <malloc.h>
#include <string.h>
#include <webp/decode.h>
#include <webp/demux.h>
#include <webp/encode.h>
#include <webp/mux.h>

typedef struct {
  WebPAnimDecoder* decoder;
  uint8_t* encoded;
  WebPAnimInfo info;
  uint8_t* frame; /* Borrowed from libwebp, never freed independently. */
  int timestamp;
} AniViewWebPContext;

/* Worker-local status: 1 malformed input, 2 resource limit, 3 allocation failure. */
static int last_error;
int aniview_webp_error(void) { return last_error; }

void aniview_webp_destroy(AniViewWebPContext* context) {
  if (!context) return;
  WebPAnimDecoderDelete(context->decoder);
  free(context->encoded);
  free(context);
}

/* Takes ownership of a malloc allocation on EVERY path, including failure. */
AniViewWebPContext* aniview_webp_create(uint8_t* encoded, size_t size) {
  last_error = 1;
  WebPBitstreamFeatures features;
  if (!encoded || !size || size > 64u * 1024u * 1024u) {
    if (size > 64u * 1024u * 1024u) last_error = 2;
    free(encoded);
    return NULL;
  }
  if (WebPGetFeatures(encoded, size, &features) != VP8_STATUS_OK) {
    free(encoded);
    return NULL;
  }
  if ((uint64_t)features.width * features.height > 8u * 1024u * 1024u) {
    last_error = 2;
    free(encoded);
    return NULL;
  }
  AniViewWebPContext* context = calloc(1, sizeof(*context));
  if (!context) { last_error = 3; free(encoded); return NULL; }
  context->encoded = encoded;
  WebPAnimDecoderOptions options;
  if (!WebPAnimDecoderOptionsInit(&options)) { aniview_webp_destroy(context); return NULL; }
  options.color_mode = MODE_RGBA;
  options.use_threads = 0;
  WebPData data = { encoded, size };
  context->decoder = WebPAnimDecoderNew(&data, &options);
  if (!context->decoder || !WebPAnimDecoderGetInfo(context->decoder, &context->info)) {
    aniview_webp_destroy(context);
    return NULL;
  }
  last_error = 0;
  return context;
}

uint32_t aniview_webp_width(AniViewWebPContext* c) { return c->info.canvas_width; }
uint32_t aniview_webp_height(AniViewWebPContext* c) { return c->info.canvas_height; }
uint32_t aniview_webp_frame_count(AniViewWebPContext* c) { return c->info.frame_count; }
uint32_t aniview_webp_loop_count(AniViewWebPContext* c) { return c->info.loop_count; }
int aniview_webp_has_next(AniViewWebPContext* c) { return WebPAnimDecoderHasMoreFrames(c->decoder); }
int aniview_webp_next(AniViewWebPContext* c) {
  return WebPAnimDecoderGetNext(c->decoder, &c->frame, &c->timestamp);
}
uint8_t* aniview_webp_frame(AniViewWebPContext* c) { return c->frame; }
int aniview_webp_timestamp(AniViewWebPContext* c) { return c->timestamp; }
void aniview_webp_reset(AniViewWebPContext* c) {
  WebPAnimDecoderReset(c->decoder);
  c->frame = NULL;
  c->timestamp = 0;
}

/* The encoder owns a fixed input picture and libwebp's constant-count canvas
 * workspaces. libwebp retains compressed frames for final muxing, not RGBA*N.
 * The public animation API can coalesce identical frames or produce a static
 * WebP for a single visual frame; the spike reports these semantics explicitly. */
typedef struct {
  WebPAnimEncoder* encoder;
  WebPPicture picture;
  WebPConfig config;
  WebPData output;
  int expected_frames;
  int added_frames;
  int finished;
  int plays;
} AniViewWebPEncoder;

static int live_encoders;
int aniview_webp_encoder_count(void) { return live_encoders; }
size_t aniview_webp_live_alloc_bytes(void) {
  /* Allocator live-byte proxy; excludes JS/native browser allocations. */
  return mallinfo().uordblks;
}

void aniview_webp_encoder_destroy(AniViewWebPEncoder* c) {
  if (!c) return;
  if (c->encoder) { WebPAnimEncoderDelete(c->encoder); --live_encoders; }
  WebPPictureFree(&c->picture);
  WebPDataClear(&c->output);
  free(c);
}

AniViewWebPEncoder* aniview_webp_encoder_create(int width, int height,
                                              int frames, int plays) {
  last_error = 2;
  if (width < 1 || height < 1 || width > 2048 || height > 2048 ||
      frames < 1 || frames > 200 || plays < 0 || plays > 65535 ||
      (uint64_t)width * height > 4194304u ||
      (uint64_t)width * height * frames > 15360000u) return NULL;
  AniViewWebPEncoder* c = calloc(1, sizeof(*c));
  if (!c) { last_error = 3; return NULL; }
  WebPAnimEncoderOptions options;
  if (!WebPPictureInit(&c->picture) || !WebPConfigInit(&c->config) ||
      !WebPAnimEncoderOptionsInit(&options)) goto Fail;
  c->picture.use_argb = 1;
  c->picture.width = width;
  c->picture.height = height;
  if (!WebPPictureAlloc(&c->picture) || c->picture.argb_stride != width) goto Fail;
  c->config.lossless = 1;
  c->config.exact = 1;
  c->config.method = 0;  /* Fixed correctness-spike profile, not a quality UI. */
  options.anim_params.bgcolor = 0;
  options.anim_params.loop_count = plays;
  options.allow_mixed = 0;
  options.verbose = 0;
  c->encoder = WebPAnimEncoderNew(width, height, &options);
  if (!c->encoder) goto Fail;
  ++live_encoders;
  c->expected_frames = frames;
  c->plays = plays;
  last_error = 0;
  return c;
 Fail:
  last_error = 3;
  aniview_webp_encoder_destroy(c);
  return NULL;
}

uint8_t* aniview_webp_encoder_input(AniViewWebPEncoder* c) {
  return c ? (uint8_t*)c->picture.argb : NULL;
}

int aniview_webp_encoder_add(AniViewWebPEncoder* c, int timestamp) {
  if (!c || c->finished || c->added_frames >= c->expected_frames || timestamp < 0) return 0;
  /* JS writes RGBA directly into the reusable picture allocation. Convert it
   * in-place to little-endian ARGB/BGRA, avoiding another full input buffer. */
  uint8_t* p = (uint8_t*)c->picture.argb;
  size_t bytes = (size_t)c->picture.width * c->picture.height * 4;
  for (size_t i = 0; i < bytes; i += 4) {
    const uint8_t red = p[i]; p[i] = p[i + 2]; p[i + 2] = red;
  }
  if (!WebPAnimEncoderAdd(c->encoder, &c->picture, timestamp, &c->config)) return 0;
  ++c->added_frames;
  return 1;
}

static uint32_t ReadLE32(const uint8_t* p) {
  return (uint32_t)p[0] | (uint32_t)p[1] << 8 | (uint32_t)p[2] << 16 | (uint32_t)p[3] << 24;
}
static void WriteLE(uint8_t* p, uint32_t value, int bytes) {
  for (int i = 0; i < bytes; ++i) { p[i] = value & 255; value >>= 8; }
}

/* libwebpmux MuxCleanup deliberately strips animation metadata when one frame
 * covers the canvas. Keep the already encoded VP8L chunk, adding only the
 * specified RIFF animation headers so duration and total plays survive. */
static int PreserveSingleVisualFrame(AniViewWebPEncoder* c, int duration) {
  WebPBitstreamFeatures features;
  if (WebPGetFeatures(c->output.bytes, c->output.size, &features) != VP8_STATUS_OK) return 0;
  if (features.has_animation) return 1;
  if (duration > 0xffffff) return 0;
  size_t chunk_offset = 12, chunk_bytes = 0;
  while (chunk_offset + 8 <= c->output.size) {
    size_t length = ReadLE32(c->output.bytes + chunk_offset + 4);
    size_t stored = 8 + length + (length & 1);
    if (stored > c->output.size - chunk_offset) return 0;
    if (memcmp(c->output.bytes + chunk_offset, "VP8L", 4) == 0) { chunk_bytes = stored; break; }
    chunk_offset += stored;
  }
  if (!chunk_bytes || chunk_bytes > 64u * 1024u * 1024u - 68) return 0;
  const size_t size = 68 + chunk_bytes;
  uint8_t* data = calloc(1, size);
  if (!data) return 0;
  memcpy(data, "RIFF", 4); WriteLE(data + 4, size - 8, 4); memcpy(data + 8, "WEBP", 4);
  memcpy(data + 12, "VP8X", 4); WriteLE(data + 16, 10, 4);
  data[20] = 2 | (features.has_alpha ? 16 : 0);
  WriteLE(data + 24, c->picture.width - 1, 3); WriteLE(data + 27, c->picture.height - 1, 3);
  memcpy(data + 30, "ANIM", 4); WriteLE(data + 34, 6, 4); WriteLE(data + 42, c->plays, 2);
  memcpy(data + 44, "ANMF", 4); WriteLE(data + 48, 16 + chunk_bytes, 4);
  WriteLE(data + 58, c->picture.width - 1, 3); WriteLE(data + 61, c->picture.height - 1, 3);
  WriteLE(data + 64, duration, 3); data[67] = 2;  /* No blend; no disposal. */
  memcpy(data + 68, c->output.bytes + chunk_offset, chunk_bytes);
  WebPDataClear(&c->output); c->output.bytes = data; c->output.size = size;
  return 1;
}

int aniview_webp_encoder_finish(AniViewWebPEncoder* c, int end_timestamp) {
  if (!c || c->finished || c->added_frames != c->expected_frames || end_timestamp < 0) return 0;
  if (!WebPAnimEncoderAdd(c->encoder, NULL, end_timestamp, NULL) ||
      !WebPAnimEncoderAssemble(c->encoder, &c->output)) return 0;
  if (!PreserveSingleVisualFrame(c, end_timestamp)) return 0;
  c->finished = 1;
  return 1;
}
const uint8_t* aniview_webp_encoder_output(AniViewWebPEncoder* c) {
  return c ? c->output.bytes : NULL;
}
size_t aniview_webp_encoder_output_size(AniViewWebPEncoder* c) {
  return c ? c->output.size : 0;
}

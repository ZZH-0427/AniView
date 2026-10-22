#include <stdint.h>
#include <stdlib.h>
#include <webp/decode.h>
#include <webp/demux.h>

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

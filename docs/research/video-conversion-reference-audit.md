# Video Conversion Reference Audit — Milestone 8C/8D

日期：2026-10-31（Asia/Singapore）。状态：**COMPLETE — research only**。

本报告选择后续技术实验候选，不表示浏览器能力已验收、依赖已获集成、
8C1/8D1 已开始或 V0.2 已发布。产品基线为 `688815b`，分支为
`feat/v0.2-static-to-gif`。只新增本报告及[许可审计](video-conversion-license-audit.md)。
未改产品代码、资源上限、依赖、PLAN、AGENTS、main、v0.1.0 或 Pages。

## 1. 结论与证据等级

**INFERRED / recommendation**：

- **8C：直接采用 Mediabunny 的 VideoSampleSource + WebCodecs + MP4 mux**，
  接收现有 canonical RGBA；技术实验第一轮只做 **MP4/H.264、无音频、一个 cycle**。
  WebM/VP9 alpha 是随后单独的能力实验，不纳入首轮必须成功的编码目标。
- **8D：Mediabunny Input + VideoSampleSink + 时间戳采样/缩放适配器**，产出同一
  canonical frame stream，交给现有 GIF/WebP/APNG encoder Workers。
  第一轮输入 MP4/H.264 与 WebM/VP9；不另写 demuxer、视频 codec 或动画 compositor。
- **Mediabunny：ADOPT WITH LIMITATIONS**。建议未来添加一个固定版本的 runtime
  dependency；本轮没有安装。**ffmpeg.wasm：test oracle only**，不作为默认引擎或
  自动 optional fallback。canvas-record/CCapture/FrameKit 等借鉴局部模式和 UX。

标记含义（下文表格一行一个判断，标签适用于该行）：

| 标签 | 含义 |
| --- | --- |
| SOURCE CONFIRMED | 已读取指定提交的实现/许可；不等于在所有设备运行过 |
| DOCUMENTED | 官方文档、公开产品说明或此次公开 UI/资源观测；产品自述会额外注明 claimed |
| INFERRED | 从证据推导的 AniView 建议、风险或预计效果；尚需实验 |
| UNKNOWN | 无足够证据，未验证或访问失败 |

**UNKNOWN**：本轮没有运行 AniView 视频转换，没有新 Android WebCodecs/视频
能力测试，没有端到端测量候选库的速度、RSS、tree-shaken bundle 或转换质量。
过去 8B 手机验收不能证明 H.264/VP9 编码可用。公开产品只检查 UI、文档和加载时
网络元数据；没有上传文件、完成其转换或反编译私有代码。

## 2. AniView 当前适配点

已读 PLAN/AGENTS、8B1 spike/Android 和 8B2 productization/Android 四份记录。
**SOURCE CONFIRMED**（本地基线）：

| 现有边界 | 可复用内容 | 视频工作仍需补齐 |
| --- | --- | --- |
| [VirtualFile](../../src/input/virtual-file.ts) | `size`、异步 `[start,end)` 读取、来源无关 | 用 Mediabunny CustomSource 桥接范围读；不能要求 UI File 控件 |
| [canonical model](../../src/conversion/model.ts) | width/height/frameCount/playCount；index/durationMs/rgba | 视频层时间戳和有限采样策略；不把视频 codec 类型泄漏给 Player |
| [frame source](../../src/conversion/frame-source.ts) | 三种动画成熟 Worker decoder/compositor | 8C 原样使用；8D 新视频 source adapter |
| [conversion broker](../../src/conversion/convert.ts) | transfer、接受后 ack、单 canonical RGBA、取消/代次隔离 | 不直接把 `ConversionFormat` 增加 mp4 就当完成；视频有独立编码/输出合同 |
| [product session](../../src/conversion/conversion-session.ts) | 借用源、独立结果、错误/进度、URL 释放模式 | 未来独立 video job，保留原 MediaSession/ArchiveSession 所有权 |
| 已有 GIF/WebP/APNG encoders | 8D 继续使用，不重复实现 | 视频采样计划必须通过现有 encoder metadata/工作量验证 |

单帧意味着传输所有权，不意味着浏览器只分配一帧：native decoder 重排/参考帧、
Mediabunny 预读、VideoEncoder 输入队列、RGBA→YUV、WASM workspace 和压缩输出
均需分别核算。当前 8B `maxFrames=200`、`maxFramePixels=15360000`、64 MiB
source/output 等限制未变；本报告提出的 8D 计划必须适配这些限制。

## 3. 已核对的源码快照

完整 SHA 是审计锚点，不以搜索缓存中的旧 npm 版本代替源码。源码下载到系统临时
目录，未执行第三方项目代码、安装项目依赖或把源码/许可证 vendor 进 AniView。
部分无关文件请求失败；下列分析涉及的关键实现和许可/声明已成功读取。

| 项目 | 审计提交 / 版本 | 主要读取位置 | 结论 |
| --- | --- | --- | --- |
| [Mediabunny](https://github.com/Vanilagy/mediabunny/tree/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc) | `cd6612380c7e3f1261d74b9b550e6fc3b65a53bc`；package 1.65.0 | src/media-source.ts、media-sink.ts、sample.ts、encode.ts、codec.ts、source.ts、target.ts、output.ts、input-track.ts、isobmff/、matroska/、guide、LICENSE | SOURCE CONFIRMED；最适合输入/输出双向共用 |
| [canvas-record](https://github.com/dmnsgn/canvas-record/tree/63a4b2b6bf221cd497c24ed5390b332dfc1d579a) | `63a4b2b6bf221cd497c24ed5390b332dfc1d579a`；6.0.0 | Recorder.js、encoders/WebCodecsEncoder.js、Encoder.js、package.json、LICENSE.md | SOURCE CONFIRMED；模式参考，不整包引入 |
| [CCapture.js](https://github.com/spite/ccapture.js/tree/f4e25a7fca6216740f57c58907d8eda8c882a0ba) | `f4e25a7fca6216740f57c58907d8eda8c882a0ba` | WebCodecsEncoder.js、FrameWrap.js、TimeWarp.js、LICENSE | SOURCE CONFIRMED；确为新版 WebCodecs 路线 |
| [FrameKit Web](https://github.com/joepUI/framekit-web/tree/b134ad6e873cf84c6d6dd99933e80e3e7d60c127) | `b134ad6e873cf84c6d6dd99933e80e3e7d60c127` | VideoGifApp.jsx、utils/frameExtract.js、format.js、StepSegment/Upload、README、LICENSE | SOURCE CONFIRMED；UX 可借鉴，批量帧保留不可移植 |
| [Video-To-Gif-Converter](https://github.com/dylansallred/Video-To-Gif-Converter/tree/ea994f3c28cd5fb226a2d76cfc06fb219e3dca3f) | `ea994f3c28cd5fb226a2d76cfc06fb219e3dca3f` | 单 HTML 的 processFrames、sequence、geometry、metrics、内嵌 gif.js；README | SOURCE CONFIRMED；MIT 为 README 声明，许可材料有缺口 |
| [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm/tree/f876f907c7e9b9bf51d4ed0b913a855a63ae63fc) | `f876f907c7e9b9bf51d4ed0b913a855a63ae63fc`；另查发布 core 0.12.10 元数据 | packages/ffmpeg/src/classes.ts、worker.ts、Dockerfile、build/ffmpeg*.sh、LICENSE、官方 FAQ/usage | SOURCE CONFIRMED；wrapper/core 许可和内存不可混为一谈 |
| [render-video](https://github.com/ziyunfei/render-video/tree/338750b6ee72650cfceeda2ad7a50e405c9ea983) | `338750b6ee72650cfceeda2ad7a50e405c9ea983` | src/index.mjs、package.json、README；未复制打包的 ffmpeg 代码 | SOURCE CONFIRMED；没有明确项目许可，reference only |
| [Dolly](https://github.com/matthewidavis/Dolly/tree/2d0f7ff504865ac55db9dd8613e1368b3595536e) | `2d0f7ff504865ac55db9dd8613e1368b3595536e` | index.html：runVideoJob、pickVideoCodec、realtime path、muxWebM/muxMP4 | SOURCE CONFIRMED；没有明确许可，reference only |

名称消歧：这里 Dolly 是 **matthewidavis/Dolly**，对应题目里的 EBML、精确时间戳和
MediaRecorder fallback。检索途中也核对了 Divyesh06/Dolly，但它是 Apache-2.0 的
Chrome 扩展/CDP 录制器，不拿它替代指定参考。FrameKit 是 joepUI/framekit-web，
不是同名商业建站产品。

## 4. Mediabunny 深入审计

以下为 **SOURCE CONFIRMED**，除明确标记 UNKNOWN/INFERRED 者外。

| 问题 | 审计发现与 AniView 含义 |
| --- | --- |
| input/output containers | 源码及[格式文档](https://mediabunny.dev/guide/supported-formats-and-codecs)均有 ISOBMFF/MP4、QuickTime MOV、Matroska/MKV、WebM，以及 Ogg/WAVE/MP3/ADTS/FLAC/MPEG-TS/HLS 等。容器支持不担保具体 codec 的 native decode/encode |
| MP4/WebM mux | `Output` 选择 Mp4OutputFormat/WebMOutputFormat，经相应 muxer 写 Target；动画不应再经过 ffmpeg remux |
| VideoSample | 包装 native VideoFrame、CanvasImageSource 或 raw plane data；带 timestamp/duration、显示尺寸、rotation/flip/colorSpace；有独立 close 生命周期 |
| VideoSampleSource | 未编码 sample 输入、内部 VideoEncoder、编码 packet→muxer；`await add(sample)` 是流控边界，调用方仍要 close 自己的 sample |
| VideoSampleSink | 从 InputVideoTrack 获取 decoded samples；getSample(t) 返回 presentation order 中 start≤t 的最后一帧；samples 为顺序迭代；samplesAtTimestamps 对单调时间点复用解码，而非每次重新 seek |
| 时间单位 | **Mediabunny 公共 sample/sink API 使用秒；WebCodecs 使用整数微秒**。不能直接把 timestampUs 传入 sink |
| VFR/CFR | 原始 sample 可逐帧不同 timestamp/duration；`transform.frameRate` 可重采样/补帧。addVideoTrack 的 frameRate metadata 也会 snap 时间；保留动画 VFR 时两者都不设置 |
| encoder 背压 | media-source.ts 在 encodeQueueSize≥4 时等 dequeue，并等 lastMuxerPromise；native encode 的同步返回不等于编码完成 |
| stream 背压 | target.ts 在 writable.desiredSize≤0 时 await writer.ready；经 muxer 和 add Promise 向上游传播。调用者不 await add 就破坏这条链 |
| BufferTarget | 整个输出在 RAM 中。MP4 默认采用 in-memory fastStart，可在 finalization 前另保留 packet/样本数据；不是 O(1) 压缩输出内存 |
| StreamTarget | 分块写 `{type:'write', data, position}`，可能有位置覆写；chunked 默认块上限 16 MiB，可配置。它不等于任意 append-only HTTP 流；另有 AppendOnlyStreamTarget，格式须满足单调写要求 |
| 直接文件写入 | 可给 StreamTarget 一个 FileSystemWritableFileStream；该流接受位置写。用户选择文件需主线程手势；Worker 可用性/流桥接仍需验证。FilePathTarget 是 Node 文件，不是 Android 文件选择器 |
| input memory | CustomSource 可用 VirtualFile.read 范围读，默认8 MiB cache，可显式约束；BlobSource 不要求预读整个文件。ZIP provider 是否一次展开/缓存是 AniView 自身另一个预算，不能被 lazy demux 宣传掩盖 |
| capability | canEncodeVideo/canEncode/getFirstEncodableVideoCodec 与 track.canDecode 之类 API 检查配置；内部仍做 isConfigSupported。必须另外实际编码关键帧、拿到 decoderConfig、finalize、decode-back |
| H.264 string | codec.ts 从尺寸/bitrate 选择 level，非 WebKit 默认 High，WebKit 有 Baseline workaround；支持 fullCodecString 覆盖。自动 level 并不替代实际帧率/硬件 probe |
| VP8/VP9/AV1 | 'vp8'、vp09 profile0/8bit、av01 profile0/8bit，level 随参数生成；Mediabunny 不凭空补上缺少的 browser codec |
| alpha keep | 不直接要求 native VideoEncoder alpha keep：内部配置 alpha discard，拆 color/alpha，两套 encoder 串联配对；alpha 按 color 的 keyframe 同步，再组成 sideData.alpha |
| WebM alpha | Matroska muxer 写 AlphaMode、BlockAdditional；VideoSampleSink 有 alpha decode/merge。这是完整附加管线，增加 native/JS 工作集及嵌套Workers；不是一个 codec string 就能保证透明播放 |
| 成功生命周期 | Output.start→逐个 await source.add→source.close→await Output.finalize；内部 flush/close encoder；调用方 close 自己的 VideoSample/VideoFrame；Input.dispose 另行执行 |
| 取消 | Output.cancel 强制关闭 source/encoder、关闭 target；但在 `finalizing` 时直接返回。StreamTarget `_close` 调用 writable.close，**不是 abort**；不能假设取消自动回滚部分文件 |
| encoded chunks | 不必应用级收集所有 chunks，StreamTarget 可随 mux 写出；但 container sample tables/cues、fragment/GOP/交错和 alpha 配对仍有保留成本。BufferTarget/in-memory fastStart 尤其保留整份输出 |
| tree shaking | package `sideEffects:false`、ES modules、按格式选择 input list；只引入 MP4/WebM 与视频 API，不用 ALL_FORMATS、Conversion、音频或可选 codec extensions。**UNKNOWN：实际 Vite Worker gzip 增量未测**，不把源码大小/项目宣传当 bundle 结果 |
| MPL-2.0 | 可与 AniView 自有 UNLICENSED 文件组成 Larger Work；浏览器 JS 分发仍有 covered-source 可获取、许可/告知义务。只用未修改 dependency 也不是零义务；详见许可报告 |

关键源码入口：
[media-source.ts](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/media-source.ts)、
[media-sink.ts](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/media-sink.ts)、
[sample.ts](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/sample.ts)、
[target.ts](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/target.ts)、
[output.ts](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/output.ts)、
[codec.ts](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/codec.ts)、
[source.ts](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/src/source.ts)。

**SOURCE CONFIRMED / alpha专项限制**：本快照ColorAlphaSplitter用一个Blob URL嵌套
Worker做CPU copyTo/拆分；透明视频读取的ColorAlphaMerger可开1–4个Worker（按
hardwareConcurrency clamp）。close会terminate这些Worker；模块缓存的Worker脚本
Blob URL寿命与单job结果URL不同。父Worker硬终止、CSP的blob worker许可、嵌套Worker
清理和这些native frame余额都需单独验证。源码显式等候的是color encodeQueueSize，
alpha packet还在colorChunkQueue配对；**INFERRED：不能由阈值4推导alpha队列也严格
≤4**，必须加慢alpha/长流内存gate。这是把VP9透明路径与首轮opaqueMP4隔离的理由。

## 5. canvas-record 与 CCapture.js

### canvas-record 6.0.0

**SOURCE CONFIRMED**：Recorder.init/start→逐帧 await step→stop→dispose；可裁取
canvas region，frame method 将 Canvas/ImageBitmap/VideoFrame 等路径归一。
VideoFrame 时间是 `time*1e6`，duration 是 `1e6/frameRate`；deltaTime=1/frameRate，
所以它面向 CFR canvas 创作，不保留已有动画任意 duration。

WebCodecsEncoder 动态 import Mediabunny，将 VideoFrame 包成 VideoSample，
await VideoSampleSource.add 后 close sample，stop await Output.finalize。
编码器默认 MP4 High5.2 `avc1.640034`，WebM VP9 `vp09.00.10.08`；keyFrameInterval
来自 groupOfPictures（默认20）/FPS。hardwareAcceleration 未硬设，允许 encoderOptions
传入；背压委托 Mediabunny，不另维护无限 frame 队列。alpha keep 限 WebM/MKV。

**SOURCE CONFIRMED**：in-browser 用 BufferTarget/in-memory fastStart，保留完整压缩
输出；file-system 用 picker→createWritable→StreamTarget、fastStart false，避免完整
视频驻 RAM，但仍有 mux 预算。平台/target 不支持会降回受支持 target。
还列有 MP4Wasm、H264MP4、GIF、图像序列、FFmpeg 等不同 encoder；package 依赖包括
ffmpeg wrapper、h264-mp4-encoder、Mediabunny 等，不能只因 WebCodecs 一条路径轻就
认为安装整个 wrapper 没成本。

错误回调区分非致命错误和 start 初始化拒绝；WebCodecsEncoder.dispose 只是清引用，
不等同于 Output.cancel，也没有为 AniView 取消中的 finalize 提供现成完整合同。
**INFERRED**：学习 await-add、目标切换、格式透明度约束、正常 finalize；不直接采用
CFR 时钟、High5.2 常量、整个依赖树或其 dispose 作为 AniView 中止机制。

源码：[WebCodecsEncoder.js](https://github.com/dmnsgn/canvas-record/blob/63a4b2b6bf221cd497c24ed5390b332dfc1d579a/src/encoders/WebCodecsEncoder.js)、
[Recorder.js](https://github.com/dmnsgn/canvas-record/blob/63a4b2b6bf221cd497c24ed5390b332dfc1d579a/src/Recorder.js)、
[Encoder.js](https://github.com/dmnsgn/canvas-record/blob/63a4b2b6bf221cd497c24ed5390b332dfc1d579a/src/encoders/Encoder.js)。

### 新 CCapture.js

**SOURCE CONFIRMED**：TimeWarp 替换 performance.now/Date/rAF/timers，并处理媒体
currentTime；FrameWrap 管理逐帧捕获/背压。它解决原始场景动画依赖 wall clock 的
确定性录制；AniView 已有 duration stream，**不需要替换全局时钟**。

WebCodecsEncoder 的 timestamp=`round(index*1e6/FPS)`，duration=`round(1e6/FPS)`；
后者仍是独立 duration rounding，不能直接作为 VFR 无漂移算法。
MP4 默认 family 顺序 **AVC→AV1**，WebM **VP9→VP8→AV1**；明确 codec 时不跨 family。
AVC candidates：High5.2、Main5.2、High4.0、Baseline3.1；VP9/AV1 各有 candidate。
每次 isConfigSupported；MP4 另外真实编码一张关键帧，检查 decoderConfig，防止仅
probe 返回 true。此模式值得学习，但 AniView 不应静默从 MP4/H.264 变 AV1。

源尺寸向下取偶数，再从左上 fit/crop；可能丢一像素。keyframe 每约2秒；默认 queue
上限8，backpressure 用提前捕获的原生 setTimeout 轮询，避免 TimeWarp 冻住等候。
VideoFrame encode 后 close；save await flush→muxer.finalize→Blob，可幂等；dispose
关闭编码器并清 target。MP4/WebM 用 vendor mp4-muxer/webm-muxer，而非本版本
Mediabunny；默认 ArrayBufferTarget 保存完整编码结果。

**INFERRED**：只借鉴真实 probe、flush/finalize 次序、独立 close、错误冒泡；不采用
全局时间 hook、裁奇数边、轮询阈值8或旧 muxer vendor 链。

源码：[WebCodecsEncoder.js](https://github.com/spite/ccapture.js/blob/f4e25a7fca6216740f57c58907d8eda8c882a0ba/src/encoders/WebCodecsEncoder.js)、
[TimeWarp.js](https://github.com/spite/ccapture.js/blob/f4e25a7fca6216740f57c58907d8eda8c882a0ba/src/TimeWarp.js)。

## 6. Video→Animation 的两个 UX/采样参考

### FrameKit Web

**SOURCE CONFIRMED**：File→ObjectURL→HTMLVideoElement；loadedmetadata/loadeddata
得到尺寸/时长，拖动/时间输入设置 segment，Canvas 预览 crop，FPS 控件1–30，默认12。
原图与较小 long-edge presets（640/500/480/320等）避免无意义 upscale；界面分步骤、
可折叠 panel、双语文案、尺寸/预计帧数/内存反馈，适合学习手机任务分解。

VideoGifApp 的帧数 `max(1,round(selectedSeconds*fps))`；时间点用包含 end 的等距
分布 `start+i/(N-1)*D`。extractFrame 设置 video.currentTime，等 seeked 后 drawImage
crop/resize，再 getImageData；8秒 timeout。不用 WebCodecs，也没有证据证明 seeked
就是帧 PTS 精确命中；端点包含和 round 可能改变实际间隔。speed 不改采样数，改变
encodeGif 使用的 effectiveFps=fps*speed。

**SOURCE CONFIRMED**：该生成路径把每帧 ImageData 加到 `frames[]`，收齐再同步
encodeGif。内存估算=frames*W*H*4，>200 MiB warning、>800 MiB danger，不是硬预算
拒绝。此路径没有 Worker 把 Canvas 提取/全部生成工作移走；取消在提取循环检查，
不保证能中断同步编码。它的 APNG/WebP 也有其他工具/依赖，不能把“六工具支持”
写成单一视频→三格式共用流式架构。

**INFERRED**：学习 trim→FPS→尺寸→数量的联动和可折叠手机 UX；不移植数组保帧、
只警告大工作量、包尾 frame inclusion 或“seeked=准确原帧”的假设。

源码：[VideoGifApp.jsx](https://github.com/joepUI/framekit-web/blob/b134ad6e873cf84c6d6dd99933e80e3e7d60c127/src/VideoGifApp.jsx)、
[frameExtract.js](https://github.com/joepUI/framekit-web/blob/b134ad6e873cf84c6d6dd99933e80e3e7d60c127/src/utils/frameExtract.js)、
[format.js](https://github.com/joepUI/framekit-web/blob/b134ad6e873cf84c6d6dd99933e80e3e7d60c127/src/utils/format.js)。

### Video-To-Gif-Converter

**SOURCE CONFIRMED**：单 HTML 包括 HTMLVideoElement、双 marker timeline、playhead
scrub、时间输入/快捷键、timeline zoom。frame stepping 按选定 GIF interval 移动
currentTime，不是视频容器真实帧索引。FPS=5/10/15/24/30，size=20–100%，speed=.25–5x。
采样 `N=ceil(D*fps/speed)`，source time 每次加 speed/FPS，输出 delay=1000/FPS。
通过 seeked 继续捕获；循环使用≤end，和估算 ceil 在精确边界可能多抓末端，不能
照搬为严格采样计划。

crop/rotate/mirror/resize 在 Canvas geometry 中完成；palette 有 per-frame/global，
dither 和 quality 各独立有帮助文案。Frame Sequence 存 sourceTime、每帧delay，
可重排/复制/删除，不再套 range 的 speed。实时显示所选 duration/FPS/帧数与估算
文件大小；>600帧、>150 sequence 的提示是 warning，不是安全硬限制。

**SOURCE CONFIRMED**：捕获时调用内嵌 gif.js `addFrame(ctx,{copy:true})`，所有 copied
RGBA 都存在其 `frames` 数组中，再交 Worker 编码；Worker 存在不等于没有全帧保留。
绘图/滤镜/逐帧seek还是主线程。未发现能替代 AniView 硬工作量限制的强制大视频预算。
**INFERRED**：借鉴 range/sequence 语义区分、质量说明和帧数显示；首版不做高级编辑、
sequence、speed、global palette，也不移植其全帧数组。

源码：[完整 HTML](https://github.com/dylansallred/Video-To-Gif-Converter/blob/ea994f3c28cd5fb226a2d76cfc06fb219e3dca3f/Video-To-Gif-Converter.html)
（processFrames约5385行、sequence约5450行、metrics约6150行）；
[README许可声明](https://github.com/dylansallred/Video-To-Gif-Converter/blob/ea994f3c28cd5fb226a2d76cfc06fb219e3dca3f/README.md)。

## 7. ffmpeg.wasm、render-video、Dolly

### ffmpeg.wasm

**DOCUMENTED**：官方0.12.10发布包的[ST文件元数据](https://data.jsdelivr.com/v1/package/npm/@ffmpeg/core@0.12.10/flat)
给 wasm **32,232,419 B（30.74 MiB）**、esm JS111,804 B；
[MT元数据](https://data.jsdelivr.com/v1/package/npm/@ffmpeg/core-mt@0.12.10/flat)
wasm32,718,323 B、JS128,947 B、额外 Worker2,115 B。只读 registry 元数据，没有安装
core。某次 CDN HEAD Content-Length 是9,289,992，可能为传输编码体，不能当原始 wasm
大小或承诺首次流量。冷启动还有下载、编译/实例化、FS 和输入复制；没有实测 Android。

**SOURCE CONFIRMED**：审计 master 的 build/ffmpeg-wasm.sh：ST initial32MB + growth；
MT initial1024MB、pthread pool32。它们是该提交构建参数，**不冒充所有发布二进制的
实际 runtime heap**。MT 需 SharedArrayBuffer/跨源隔离及额外 Worker，通常涉及
COOP/COEP；当前 Pages 无法由本项目自行配置这些响应头。ST 不要求线程/SAB，但仍
不能消除文件/输出/codec 的内存成本。

**SOURCE CONFIRMED**：标准 wrapper Worker writeFile/readFile 使用 Emscripten FS。
普通流程把完整输入写 FS、完整输出留 FS，再 readFile→传输→Blob；输出回传 transfer
不会让 FS 内原件消失。存在 WORKERFS/mount 等进阶输入方式，不代表默认输出流式。
FFmpeg 的 x264/x265/libvpx/libwebp、GIF/PNG/APNG 及 MP4/WebM mux/filter 能力很广，
但实际支持取决于编译配置；每个选定 oracle 都应记录 version/buildconf/encoders。
不能笼统保证所有视频/透明通道/动画时序都受支持。

exec timeout、log/progress callback 可用，官方指出 progress 在输入/输出等长时才
准确。AbortSignal 在消息层拒绝 Promise，**不是可靠中断已运行同步 C exec**；
terminate 才终止 Worker/所有未完成请求，下一次须 load。正常释放要 unlink 输入/
输出或销毁 Worker。wrapper MIT，Dockerfile 明确 `--enable-gpl`、x264/x265；core
按实际 FFmpeg/外部库许可，绝不能据 npm wrapper 的 MIT 把整核当 MIT。

**INFERRED**：默认引擎和自动 fallback 都不合适；不让一次 WebCodecs 不支持触发
30MiB+下载、全FS副本和新的许可证分发链。未来可在项目外用合法合规的 native FFmpeg
作为独立时序/解码 oracle；本轮只研究，未运行转换 oracle。

源码：[worker.ts](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/f876f907c7e9b9bf51d4ed0b913a855a63ae63fc/packages/ffmpeg/src/worker.ts)、
[classes.ts](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/f876f907c7e9b9bf51d4ed0b913a855a63ae63fc/packages/ffmpeg/src/classes.ts)、
[build flags](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/f876f907c7e9b9bf51d4ed0b913a855a63ae63fc/build/ffmpeg-wasm.sh)、
[Dockerfile](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/f876f907c7e9b9bf51d4ed0b913a855a63ae63fc/Dockerfile)。

### render-video — reference only

**SOURCE CONFIRMED**：src/index.mjs 从 Canvas/VideoFrame callback 拉帧，固定25fps；
H.264 avc1.420034、prefer-software、Annex B；奇数编码尺寸加1，但没有独立完整像素
padding 合同。收集所有 EncodedVideoChunk，再复制到单个大缓冲，交打包 ffmpeg
MEMFS remux MP4；不是现代轻量 mux 路线。VideoFrame encode后close，但没有严格
dequeue 背压；逐次 configure，结尾 flush 未await；error只log，没有可靠cancel/
全链 finally close。**INFERRED**：学习 callback 拉帧的接口形状；不学 chunks[]、
多次复制、隐式音频生成、flush/错误处理；无明确项目license，不复制。

源码：[src/index.mjs](https://github.com/ziyunfei/render-video/blob/338750b6ee72650cfceeda2ad7a50e405c9ea983/src/index.mjs)。

### Dolly — reference only

**SOURCE CONFIRMED**：审计的 index.html 比检索README描述更丰富：既有 MP4/H.264
也有 WebM VP9/VP8 和手写两种 mux。runVideoJob 在离线时间轴 f/FPS 上绘制，
timestamp=round(f*1e6/FPS)、duration=round(1e6/FPS)，queue>6时yield，关键帧约每秒；
flush在try内，finally close。所有编码 chunks 都复制存数组，末尾自写 EBML/MP4
组合成Blob；WebM时间戳另round到毫秒，不等于全链微秒保真。

codec probe 给 MP4若干 High/Main/Baseline string，失败可回WebM并告知；无WebCodecs
时有 Canvas.captureStream+MediaRecorder/rAF wall-clock fallback，完整Blob保留。
**INFERRED**：学习确定性时间轴/显式fallback提示，不能把 realtime fallback 描述为
等价时序保证，不复制无许可证的 EBML/MP4 writer，也不引入其PWA/编辑器/音频系统。

源码：[index.html](https://github.com/matthewidavis/Dolly/blob/2d0f7ff504865ac55db9dd8613e1368b3595536e/index.html)
（runVideoJob约5328行；codec/realtime约5639行；mux约5702行）。

## 8. 产品黑盒审计：事实、声明、缺口

2026-10-31 使用安装的桌面 Edge（CDP、独立临时profile）读取公开 DOM/控件、截图、
Network request method/URL/status/MIME、target类型；每页约9秒加载观测。
不读取私有脚本实现、不抓请求body、不选择用户媒体、不发转换请求。
原始记录仅在 ignored `.tools/research/browser/`，源码快照在系统临时目录。
下列“local claimed”仅是公开声明，不能由 idle 页面没上传推导实际处理位置。
第三方广告/统计请求存在，也不能反推媒体被上传。

### EZGIF

**DOCUMENTED / observed UI**：Animation→MP4入口支持GIF/WebP/APNG等；有background
color（文档默认白）和 Number of loops。说明MP4无GIF式loop flag，需实质重复帧或
播放器循环；输出silent。其“MP4不支持透明”应限定为这里的普通H.264输出，不泛化
成所有ISO-BMFF codec组合的理论限制。

**DOCUMENTED**：video→GIF/server 页面200MB、上传后1小时删除，trim、crop、resize、
FPS、encoder/method、loop。5fps最多60秒、10fps最多30秒，故约300帧是该文档模式
的工作量上限。video→WebP还提供quality0–100（100为lossless），APNG有lossy0选项；
两者页面的duration/FPS策略不能凭GIF页完全等同。明确建议native分辨率或更小，
支持带alpha的视频→GIF及VP9 alpha→WebP，但本轮没转换验证。

**DOCUMENTED / observed UI**：当前页有Local processing，浏览器实际加载后默认本地
说明变为“仅浏览器能解码的格式”“文件大小不限”；local GIF控件FPS1–50、默认10，
width输入1–1280、默认800，提供多种quantizer/dithering和sequence模式。
所以“EZGIF一律server/200MB/300帧”不成立。无本轮local实际输出或native内存证据，
不把unlimited文案借用为AniView安全策略。高级不支持工具明确会转server。

来源：[GIF→MP4](https://ezgif.com/gif-to-mp4)、[Video→GIF](https://ezgif.com/video-to-gif)、
[Video→WebP](https://ezgif.com/video-to-webp)、[Video→APNG](https://ezgif.com/video-to-apng)。

### EZWebP

**UNKNOWN / unavailable, insufficient evidence**：`https://www.ezwebp.com/zh` 在Web
读取返回502，在实际Edge显示ERR_SSL_PROTOCOL_ERROR。没有独立确认输入、trim、FPS、
分辨率、是否本地或手机UX。搜索列表的“本地执行/支持多格式”不是官方可核验实现
证据。本轮不据其选codec/架构；若可用，未来再评极简UX。

### SoConvert

**DOCUMENTED / observed UI**：多文件、目录input、Save All、Options、选择输出目录，
GIF→MP4页面可用；格式目录列GIF/APNG→MP4/WebM及视频→GIF/WebP/APNG等。
具体“Animated WebP→视频”的逐帧支持仍**UNKNOWN**，不能从静态WebP链接推定。
**DOCUMENTED / claimed**：页面称全部本地；公开说明列宽高、FPS、bitrate、encoding
speed和HH:MM:SS trim、转换后逐个存目录/SaveAll。文案通用，不证明每个输出都有
独立lossless/alpha/loop合同。

**DOCUMENTED / resource observed**：页面确实请求同源
`/webdeps/ffmpeg/core/dist/esm/ffmpeg-core.wasm`，200/application/wasm。
这支持“加载了FFmpeg相关WASM资源”，不证明哪次转换执行该核、完整codec列表、版本、
本地无上传或内存上限。没有转换时观测到Worker不表示它从不用Worker。
**INFERRED**：未来批量任务可借鉴输入队列、每项状态、可选输出目录、SaveAll；
File System Access必须可选，移动端保留普通逐个download，批量也要串行有界。

来源：[GIF→MP4](https://soconvert.com/giftomp4)、[MP4→GIF](https://soconvert.com/mp4togif)、
[公开格式目录](https://soconvert.com/)。

### OnlineConverter.com

**DOCUMENTED**：video→GIF公开步骤明确上传，限200MB；privacy也描述server上的文件。
[About](https://www.onlineconverter.com/about)列video output最多2GB、动画output200MB、
单步30分钟；这些是服务限制，不是浏览器内存预算。首页明确列后端FFmpeg/ImageMagick；
不反编译或猜具体命令/构建。支持众多容器，是兼容性/输出行为oracle候选，不是AniView
本地架构参考，也不建议把用户私有媒体发它验证。

来源：[GIF→MP4](https://www.onlineconverter.com/gif-to-mp4)、
[Video→GIF](https://www.onlineconverter.com/video-to-gif)、
[Video→WebP](https://www.onlineconverter.com/video-to-webp)、
[首页后端说明](https://www.onlineconverter.com/)、[Privacy](https://www.onlineconverter.com/privacy)。

### OnlineConverter.online

**DOCUMENTED / claimed**：具体Video→GIF页面宣称Canvas、本地、零上传；实际公开UI
有trim、320/480/640/Original、10/15/24/30fps，默认480和15。
**DOCUMENTED / observed**：本轮看到普通页面脚本/统计加载，没有转换前Worker。
**UNKNOWN**：真正转换引擎、兼容的codec、输出保真、是否每一个video tool均本地、
实际文件上限。通用100MB弹层出现于页面模板，不能当此工具已验证的强制上限。
只借鉴明确的trim/FPS/尺寸流程，不能把营销claim升级成私有实现事实。

来源：[具体Video→GIF](https://onlineconverter.online/video-tools/mp4-to-gif)、
[目录](https://onlineconverter.online/)。

### 产品 benchmark matrix

此表标签：E=DOCUMENTED公开UI/说明，S=SOURCE CONFIRMED，C=DOCUMENTED但仅claimed，
?=UNKNOWN；“分工具”表示另一个流程，不宣称端到端视频直出。

| Product | Anim→Video | Video→GIF | Video→WebP | Video→APNG | Local | Trim | FPS | Resize | Alpha | Loop |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| EZGIF | E MP4/WebM | E | E | E | C可选local；E server | E | E模式不同 | E不建议upscale | E目标相关 | E视频重复/动画loop |
| EZWebP | ? | ? | ? | ? | ? | ? | ? | ? | ? | ? |
| SoConvert | E GIF/APNG；WebP动画? | E | E目录 | E目录 | C；E有WASM资源 | E说明 | E说明 | E | ? | ? |
| OnlineConverter.com | E格式目录 | E | E | ? | E上传/server | ?本页未见 | ? | ? | ? | ? |
| OnlineConverter.online | E目录claim | E | ? | ? | C具体页本地 | E | E10–30 | E320–original | ? | ? |
| FrameKit | 未见 | S | 分工具S | 分工具S | S所审计路径 | S | S1–30 | S | S chroma/输出差异 | S导出器相关 |
| Video-To-Gif | 未见 | S | 未见 | 未见 | S所审计路径 | S | S5/10/15/24/30 | S20–100% | ?原视频alpha合同 | S无限/一次 |

## 9. 两个方向的架构比较

以下均为 **INFERRED / architecture assessment**，不是已经测量的性能排名。

### 8C：Animation→Video

| 维度 | A 直接Mediabunny/WebCodecs | B canvas-record式wrapper | C ffmpeg.wasm |
| --- | --- | --- | --- |
| canonical fit | 最自然；单帧Worker适配 | 绕到canvas、CFR recorder多一层 | 需要rawvideo/临时文件或另一条codec链 |
| bundle | 只选视频/容器、lazy Worker；确数待测 | recorder+多备用encoder依赖，裁剪复杂 | core约31MiB原始文件+wrapper |
| memory | 有界RGBA/native队列，输出单独上限 | 正常路径相似，但整包不同引擎各异 | heap+FS输入/输出+读回副本 |
| Android | Worker codec probe+真实encode gate | 同样依赖native codec，没有兼容魔法 | ST慢/内存，MT隔离/大heap风险 |
| codec/container | 浏览器codec，库负责mux | 同一库再封装，默认CFR | 广，但取决于build；输入模型更重 |
| alpha | opaqueH264；VP9 side-data另probe | 支持配置但仍同样双编码成本 | pipeline/pix_fmt/filter都要核对 |
| flow/stream | await add→mux→target；可文件流 | 可借模式，不必依赖wrapper | 标准MEMFS不是流式输出 |
| complexity/license | 新适配层；MPL covered files告知 | 额外API/生命周期；MIT+传递许可证 | 编译/隔离/FS/取消+GPL core审计 |
| extensibility | 8D共用demux/samples/targets | 适合canvas创作，非任意VFR | 格式广但与现有成熟decoder重复 |

选择 **A**；B只学模式；C仅外部oracle。

### 8D：Video→Animation

| 维度 | A Mediabunny sink+sampler | B HTMLVideo seek+Canvas | C ffmpeg.wasm |
| --- | --- | --- | --- |
| 帧准确/顺序 | PTS/presentation order、关键帧seek/B帧由库处理 | seeked不能证明原帧精确；随机seek重复解码 | codec成熟但须建立PTS/filter命令合同 |
| VFR | 按目标timestamp选样、可清楚定义 | currentTime近似展示，浏览器可差异 | 可选fps filter，但不能凭默认同步策略 |
| seek成本 | 单调samplesAtTimestamps复用解码 | 每个采样点seek开销、手机波动 | 顺序decode但FS和WASM成本 |
| 主线程/手机 | DedicatedWorker可行，需新真机gate | DOM video必须主线程，Canvas阻塞风险 | Worker但高内存/冷启动 |
| 内存 | 小native样本队列+1canonical，不保留全片 | 若逐帧即时encode尚可；两个参考实际保帧不可学 | 普通FS流程全输入输出，多副本 |
| 采样/尺寸 | timestamp计划+Worker transform | UI预览方便，受native播放格式限制 | 强但容易绕过canonical/重复encoder |
| 兼容/体积 | 库支持容器≠浏览器codec；按需bundle | 体积轻；媒体元素支持≠VideoDecoder支持 | codec广、体积最大 |

选择 **A**。B可作为未来trim预览交互，不能未经准确性gate成为8D输出基线。

## 10. 时间戳、VFR、loop 与颜色策略

### 时间模型

**INFERRED / recommendation**：视频适配层统一整数微秒，canonical继续毫秒。
累计边界而非逐帧round后累加：令D[n]为第n帧前全部durationMs之和，采用补偿求和
（Kahan/Neumaier，或源本就整数ms时安全整数加法），边界B[n]=round(1000*D[n])；
timestampUs=B[n]，durationUs=B[n+1]−B[n]。这样总长只在边界取整，不随帧数积累
独立round误差。27/100/500ms对应边界0/27000/127000/627000。

检查finite、安全整数、单调和正duration；0ms或sub-µs边界碰撞第一轮明确reject，
不偷偷补1ms/丢帧。若未来支持合并零长可见状态，需另定语义。Mediabunny接口处才
换成秒：timestampUs/1e6；**源码sample getter有Math.trunc(seconds*1e6)**，因此
round-trip与浮点边界必须在spike验证，不能只测AniView账面时间戳。
MP4 timescale也会量化（本快照默认global57600）；WebM有自身timecode精度，不能
承诺输出文件逐µs完全一致。gate分别量测输入边界、encoded packet PTS、解码后总长。

**INFERRED**：8C默认VFR，不设置固定frameRate metadata/transform；保留原始duration，
避免30fps复制导致27ms闪帧遗漏/改变、长hold变多帧和额外编码量。CFR只作明确选择的
后续兼容实验：用全局帧格点决定每格显示的源帧，不以每源帧round(duration*30)累计。
VFR在encoder/container API层可表达；Android编码/外部播放器最终支持是UNKNOWN，
必须gate。VFR文件不保证更小，codec运动估计/重排也影响大小。

### Loop / audio

**DOCUMENTED**：EZGIF用真实重复表示视频loop；MP4/WebM无可等同canonical total plays
的通用自动循环flag。**INFERRED**：首轮8C固定导出**一个cycle**，无论playCount=0/1/N；
UI未来要明确“一次动画周期”，不要把infinite展开或自动按巨大N输出。待8C1通过，
再考虑默认1、范围1–10的Export repeats，并对重复后时长/工作量/输出做统一预算。
首轮无audio；8D忽略所有audio tracks。两者均不实现音频系统。

### Alpha / odd sizes / color

**INFERRED**：MP4/H.264固定opaque，先把canonical straight RGBA合成到用户背景；
建议未来默认白色、允许明确选色（黑色亦可），实验至少白/黑各一组。绝不能把Viewer
checkerboard烘进视频，也不能只设alpha discard就依赖实现决定透明像素的RGB。
WebM/VP9 preserve alpha仅在双encoder、mux、decode-back、独立播放器均通过后开放；
不要把浏览器native VP9的单个alpha='keep' probe当作足够证据。

**SOURCE CONFIRMED**：Mediabunny拒绝AVC/HEVC奇数边；CCapture静默向下裁偶数。
**INFERRED**：AniView选择**向上pad到偶数**，最多右/下加一像素，与选定背景一致；
保留原像素不拉伸/不裁剪，报告输出尺寸；若padding后超预算则reject。
VP9奇数不是所有profile/API的普遍禁令，按实际config测；首轮需要统一时亦可明确pad，
不要把4:2:0惯例当全codec规范。

**DOCUMENTED**：[WebCodecs标准](https://www.w3.org/TR/2026/WD-webcodecs-20261026/)
有colorSpace、fullRange、RGB/BT.601/709/2020等描述。**INFERRED**：首版是SDR
sRGB/RGBA8；构造raw VideoFrame时准确标RGB/full-range与sRGB transfer/709 primaries，
native encoder负责RGBA→YUV。不要把RGBA字节仅改标签为BT.601/limited来假装转换。
不自写YUV矩阵、不加高级色域选项；测试黑白灰阶/色块/边缘/alpha背景，记录输出
decoderConfig和矩阵/范围。8D先限SDR8bit；HDR/PQ/HLG/10bit需明确unsupported或
单独经过色调映射研究，不能无声明截成RGBA8。

## 11. Codec/container/browser 与 API 可用性

**DOCUMENTED**：WebCodecs不强制实现任何特定codec；AVC/VP9各有registration。
[AVC注册](https://www.w3.org/TR/webcodecs-avc-codec-registration/)、
[VP9注册](https://www.w3.org/TR/webcodecs-vp9-codec-registration/)。
`avc1`需完整profile/compatibility/level；不要把avc1.42E01E（常见Baseline3.0例子）
用于所有分辨率/帧率。建议先用Mediabunny按实际尺寸/bitrate构造配置，再有明确顺序的
Baseline/Main/High合规候选探测；尽量保持H.264，而非悄悄换输出codec。
hardwareAcceleration=no-preference先测；hardware/software preference是hint，不保证
硬件实现或低内存。isConfigSupported true后仍可能配置/encode/flush失败。

| Input container | Codec | 证据/浏览器可能性 | 初轮建议（INFERRED） |
| --- | --- | --- | --- |
| MP4 | H.264/AVC | DOCUMENTED库可demux；UNKNOWN具体Android配置 | 8D1必测，按track.canDecode+实际解码接受 |
| MP4 | HEVC/H.265 | DOCUMENTED库可demux；UNKNOWN设备/OS/profile能力 | 不作首轮保证，清楚报不支持 |
| WebM | VP8 | DOCUMENTED库可demux；UNKNOWN目标浏览器实测 | 可后加低成本探测，首轮不承诺 |
| WebM | VP9 | DOCUMENTED库可demux；UNKNOWNprofile/bitdepth/alpha | 8D1必测opaque8bit；alpha单独gate |
| WebM | AV1 | DOCUMENTED库支持容器/packet；UNKNOWNnative decode | 后续能力增强，不默认纳入 |
| MOV | AVC/HEVC/ProRes等 | DOCUMENTEDQuickTime demux；codec各自不同 | 不能按.mov扩展名宣布支持；rotation样例可实验，正式支持后定 |
| MKV | AVC/HEVC/VP9/AV1等 | DOCUMENTEDMatroska demux；browser video元素常另有限制 | 不是rename成WebM就兼容；只在后续probe验证 |

**UNKNOWN**：Android Edge、Quark上的WebCodecs encoder/decoder、可编码H264/VP9
profile、并行双encoder、回后台资源回收、保存视频后的系统播放，均未由本轮验证。
“Quark基于Chromium”不足以断言编码支持。缺能力必须解释，保留原查看/动画转换功能。

**DOCUMENTED**：VideoEncoder/VideoDecoder/VideoFrame标准暴露于DedicatedWorker；
VideoEncoder/Decoder受SecureContext约束。OffscreenCanvas按所需2D/WebGL能力实际检测。
WebCodecs不依赖SharedArrayBuffer/COOP/COEP，普通HTTPS静态Pages可承载；
**HTTP LAN IP不是可信localhost**，未来手机试验要HTTPS且手机信任证书，或明确USB
port-forward到手机localhost。不可把HTTP下API缺失判为Android不支持；不默认要求
用户开不安全浏览器flags，也不因此部署到生产。

**DOCUMENTED**：[Chrome官方File System Access说明](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
列Chromium多平台（含Android），但要求按具体picker feature检测和用户手势。
**UNKNOWN**：目标Edge/Quark版本的showSaveFilePicker/showDirectoryPicker及取消/授权
行为；不能从“Android有File APIs”推到所有picker/文件流均可用。作为optional enhancement，
普通Blob下载必须可用；OPFS与系统picker也不是同一能力，本轮不引入持久化。

## 12. Memory / backpressure / Worker 与取消设计

以下为 **INFERRED / proposed contract**，没有实施。

### 8C单帧路径

```text
existing animation decoder Worker
  → transfer RGBA → Main broker (no pixel copy)
  → transfer RGBA → dedicated video encoder/mux Worker
  → RGBA/background/padding → VideoFrame → VideoSampleSource.add
  → close owned VideoSample/VideoFrame; await backpressure; ack
  → next canonical frame
```

直接raw ArrayBuffer/Uint8Array构造RGBA VideoFrame最贴合canonical：无需ImageData
对象+Canvas.putImageData+Canvas再捕获。所有权转移只是跨Worker不复制；
raw→VideoFrame通常仍会复制/转换，不能宣称zero-copy。新标准的buffer transfer构造
选项不能未经旧Android验证就依赖。OffscreenCanvas适用于确需缩放/alpha合成的路径，
ImageBitmap再包一层通常多资源。ImageData本身不是VideoFrame图像构造重载中的
CanvasImageSource；可用其.data走raw构造，不必为了适配再绕Canvas，也不能因此免掉
native颜色转换。
像素loop、合成、padding、VideoFrame构造、mux全部在Worker；主线程只消息/进度/取消。

**SOURCE CONFIRMED**：库内部encoder阈值4、sink combined queue阈值4；这不是每个
native codec只留4帧的硬内存上限。**INFERRED**：先使用库await-add背压，不并发add，
保留AniView canonical in-flight=1，不fork库改队列。native峰值超Android预算则缩小
实验画布/时长，或评估底层EncodedPacketSource自控阈值2的独立方案后再决策。
不把每帧flush当背压：flush用于成功收尾，逐帧flush会破坏编码效率/延迟语义。
建议opaque实验监控pending packets、encoded bytes、native帧余额和UI heartbeat；
alpha双encoder另设预算，不能用opaque测量代替。

### 8D单调样本路径与orientation

Mediabunny Input/VideoSampleSink放专用视频decode Worker，range source仍为VirtualFile；
生成单调目标timestamp序列，samplesAtTimestamps复用关键帧/packet decode。
每次取一sample，显式应用rotation/flip、非方形像素与resize，输出一份full-canvas
straightRGBA8；关闭sample后把RGBA按原broker transfer给既有animation encoder Worker。
原始coded size与规范显示size分开；**canonical一定是用户眼睛看到的直立像素**，
不能只把rotation metadata带到不支持它的GIF/PNG。VideoFrame.displayWidth/Height
不等于已经把track旋转烘进像素；Mediabunny sample.draw能考虑rotation/flip，raw copy
不自动保证该语义。测试90/180/270度、不等像素宽高比，避免重复旋转。

库会预解少量native样本且有重排缓冲；保持其原生队列与canonical单RGBA计数分开。
迭代提前结束必须iterator.return，close借出的sample，finally Input.dispose。

### Worker拓扑比较

| 方案 | 判断 |
| --- | --- |
| A decoder Worker→Main→encoder Worker | **推荐**；沿用8B transfer/ack/代次/诊断，Main无绘图；消息开销需测但不先优化 |
| B decoder→MessageChannel→encoder | 未来确实测到broker开销才考虑；错误传播/取消所有权/统计更复杂 |
| C single conversion Worker | 新视频输入可减少hop但需重排现有成熟decoder模块/构建；当前8C会诱发重复decoder或重构，不先做 |

### 压缩输出预算与streaming

8C1先BufferTarget→Blob，source/output各≤64MiB，帧数/像素工作量沿现有动画限制，
单cycle≤30秒作为新增实验建议。显式评估fastStart:false与默认in-memory的内存/播放
差异；最初偏向false减少compressed packet额外副本，文件可下载播放后再定fastStart。
输出bytes要随onEncodedPacket/容器写入计数，中途超限即中止；只在final Blob后检查
不安全。mux overhead、BufferTarget增长/最终buffer/Blob可能同时存在，64MiB不是RSS。
预算无法中途可靠施加则spike不能通过。

大视频最终适合StreamTarget→FileSystemWritableFileStream，须处理位置写/fragment、
背压、用户授权、部分文件回滚；**V0.2首版不值得以它为必需功能**。
保留边界，小文件受控输出优先；不把StreamTarget接一个不断push数组的sink叫低内存。
不在本轮实现文件流/OPFS/Service Worker。

### 取消的具体陷阱

- 成功：完成输入→source.close→await finalize→publish Blob；释放native句柄后完成UI状态。
- 取消：先标记代次失效、停pull/ack，发abort；非finalizing时尝试await Output.cancel。
  **finalizing阶段cancel无效、native stall或超时**时，以专用Worker terminate作为硬停止。
  不把flush成功部分文件显示为成功，不让旧job完成覆盖新job。
- direct WebCodecs close/reset会丢队列，不能reset后把剩余chunk拼成完整文件；
  所有owned VideoFrame/VideoSample按finally释放，input/iterator/target另行处理。
- 库cancel会close stream而不是abort；未来文件target必须有应用拥有的transaction/
  abort封装，取消不提交不完整文件。浏览器已提交部分文件不保证能自动删除；应报告，
  不能承诺“取消=撤回下载”。Blob路径直接丢partial result并revoketemporaryURL。

## 13. 8D trim / FPS / resize / sample预算建议

全部是 **INFERRED / proposed**, 不改既有200帧encoder guard。

先将用户相对片段时间加上track的firstTimestamp，得到库使用的绝对presentation时间；
不能假设媒体都从PTS零开始。选择半开区间[start,end)，D=end−start>0；
输出FPS为F，N=ceil(D*F)，采样时刻
start+k/F（0≤k<N；严格<end），边界以整数微秒全局计算，最后一帧截到end。
采样选覆盖该PTS的presentation frame；缺帧/时域空洞明确处理/报错，不自动选未来帧
或静默黑帧。不把FrameKit的含end等距算法直接照搬。10秒×15fps=150帧是精确整除例。
若将来有speed=s，则source step=s/F、输出总时长D/s；首轮speed固定1，不加编辑功能。

| 项目 | 初轮候选 | 原因 |
| --- | --- | --- |
| sample frame cap | **150**，并非直接沿用200 | 10s×15fps常用短片；比服务端约300保守；150仍须像素预算，不能保证全部分辨率支持 |
| selected duration | min(20秒,150/F,像素预算/(输出W×H×F))，精确N再次校验 | 5fps最长20秒、10fps≤15秒、15fps≤10秒、30fps≤5秒，预算还可更低 |
| output long edge | **480默认**、720、Original（须≤1280）；不upscale，保比例 | 两个UX参考强调缩小；高native输出会显著抬高现有WebP/APNG工作量 |
| input native gate | 建议encoded≤64MiB、SDR8bit、coded侧≤2048且≤4,194,304px | 输出resize不免掉native解码内存；4K/超限先拒绝，不假装普适手机视频 |
| aggregate pixel gate | **仍≤15,360,000 pixel-frames** | 保留已测动画encoder预算；不因视频input就放宽 |
| GIF FPS | 5/10/20，默认10 | 都可整centisecond；现有encoder逐帧round，不改时序算法 |
| WebP/APNG FPS | 5/10/15/20/24/30，默认15 | 更细时间单位；仍需要测实际输出duration/rounding |
| output plays | 默认infinite的动画输出，明确一次/无限选择留产品化评审 | 输入视频无动图loop语义，不能假装继承 |

480×270×150=19,440,000超出当前pixel预算，只允许118帧，15fps约7.87秒；
320×180×150=8,640,000可过。720×405最多52帧，1280×720最多16帧。
应在未来UI给真实计算后可选区间，提示减小尺寸/FPS/trim；不能写“所有480p10秒均可”。
720p/480p常指短边高度而非long edge，本建议以**长边像素**命名，避免混淆。

30fps对GIF可以有运动收益，并非没意义，但1000/30≈33.333ms会被现有GIF写成30ms，
有明显总长/速度误差；24/15也不精确。因此首轮GIF不共用所有FPS选项。以后若要30，
应有显式近似提示或累计centisecond边界分配的新时序设计，并重新验收，而非悄改encoder。
APNG/WebP也不能免掉容器时间量化，但有更细精度。

## 14. 建议的 8C1 与 8D1 gate（均未启动）

### 8C1 — MP4/H.264 technical spike

**INFERRED / proposal**：GIF/APNG/Animated WebP现有source→RGBA→专用VideoFrame/
Mediabunny encoder Worker→MP4/H.264；A拓扑，VFR整数微秒边界，1cycle，无audio；
不含WebM mandatory目标、产品导航、格式质量编辑、batch或持久化。

必须通过：

1. 固定依赖版本/完整MPL notices和covered-source入口；测lazy Worker raw/gzip增量，
   普通首页/Viewer/Creator无新增视频载荷；Worker/runtime路径继续`/AniView/`。
2. DedicatedWorker中实际probe并成功编码/flush/finalize/decode-back，检查avcC/
   decoderConfig/codec/profile；不以isConfigSupported代替结果。无能力可取消退出，
   不自动下载FFmpeg或偷偷改AV1。
3. 原三格式、partial/disposal/透明/半透明，白黑背景；27/100/500ms、短帧、长hold、
   非整数duration累加、一次/无限/多次源均只1cycle；0duration明确拒绝；奇数pad。
   timeline总长容差预先定为≤1ms（并报告container tick量化），帧顺序无错/尾帧无截断；
   有损RGB用独立视觉/误差阈值，不能要求逐字节lossless。
4. canonical in-flight=1、库队列/输出/峰值记录，无全RGBA数组；检查decoder composer、
   native队列、output buffer分别预算；slow encoder/slow writer不无限增长。
5. 取消opening/feeding/finalizing、错误、后台→恢复、重跑、连续多job，最终native
   frames/Workers/URL清零；finalizing中止覆盖Mediabunny.cancel no-op路径。
6. 安装的桌面浏览器＋**全新Android Edge和Quark**：HTTPS/可信localhost、无HMR，
   小64×48×6、中320×240×40、受限大画布样例、各自多轮取消/下载/系统播放。
   记录actual config、UI heartbeat（候选门槛正常前台无>100ms主线程长停顿）、资源与
   是否重载；后台计时暂停单独记录，不混算heartbeat；旧8B验收不替代。

可后续另提WebM/VP9 alpha probe：双encoder可用、BlockAdditional/AlphaMode、独立
播放器透明背景、soft-alpha误差、queue与native memory、取消清理全部单列gate。
这不是本轮已批准并行实现任务。

### 8D1 — video sampling technical spike

**INFERRED / proposal**：MP4/H.264 + WebM/VP9 opaqueSDR输入，经Mediabunny Input/
VideoSampleSink→单调trim采样→orientation/resize→canonical→原GIF/WebP/APNG encoder。
技术harness从第一轮就验证trim、FPS、resize和150帧/像素动态预算，不先做timeline产品UI。

必须通过：

1. 用独立frame-number/PTS oracle的CFR/VFR/B帧/GOP样例、非零起始timestamp、
   clip内seek、末帧、精确end与非整数采样长度；验证每个取样点对应展示帧，不只查count。
2. 90/180/270度、flip/显示纵横比、1080p→小图、禁止upscale、4K/超限/HDR/不支持
   codec受控拒绝；读取container metadata与codec分别检测，扩展名矛盾不能覆盖二进制。
3. 源64MiB和native画布预算、输出150cap与现有pixel/output上限同时生效；不得为video
   默认调高200帧encoder guard。FPS/duration取整导致边界超限也需提前reject。
4. 输出GIF颜色/二值alpha/centisecond与短delay规则、WebP合帧、APNG完整帧与RGB
   精度边界继续透明报告；输出时间/plays是采样计划，不伪称源video有loop flag。
5. 提前iterator.return/样本close/Input.dispose；取消read/decode/resize/encode/finalize、
   新旧job隔离和重复操作后资源余额；不保留整段native sample或RGBA数组。
6. 桌面＋新Android Edge/Quark真实harness，分别probe VideoDecoder/OffscreenCanvas/
   RGBA copy路径/Worker deflate；无HMR/安全上下文、后台恢复、Cancel→重跑、下载
   重开。APNG deflate不可用时清楚报target unsupported；不自动引新compression依赖。

## 15. 可复用清单、依赖决定与避免清单

| Source | Component | Reuse type | License / 证据 | AniView recommendation |
| --- | --- | --- | --- | --- |
| Mediabunny | Input/CustomSource、MP4/WEBM格式、VideoSampleSink | dependency（未来） | MPL-2.0 / SOURCE CONFIRMED | 8D输入和单调sample，不用ALL_FORMATS |
| Mediabunny | Output/VideoSampleSource/VideoSample/Mp4OutputFormat/BufferTarget、capability helpers | dependency（未来） | MPL-2.0 / SOURCE CONFIRMED | 8C直接adapter；WebMOutputFormat/StreamTarget后续能力增强 |
| canvas-record | await-add、output target、正常收尾 | code pattern；若复用片段保留notice | MIT / SOURCE CONFIRMED | 不引整个recorder及fallback依赖树 |
| CCapture | 实际keyframe/decoderConfig probe、flush与close | code pattern；若复制保留notice | MIT / SOURCE CONFIRMED | 不接全局clock/旧muxer vendor |
| FrameKit | trim/FPS/尺寸/数量/内存显示、折叠步骤 | UX+算法对照 | MIT / SOURCE CONFIRMED | 重写为有界sampler，不复制全帧数组 |
| Video-To-Gif | range/sequence区分、质量说明、数量估算 | UX参考 | README声明MIT；许可材料待补 | 只学UX；现阶段不复制单HTML或内嵌codec |
| ffmpeg.wasm | 独立转换/metadata对照 | external oracle | wrapperMIT；core build-specific/GPL | 不默认引入，也不自动fallback |
| render-video | pull callback→frame的接口思路 | reference only | 无明确license | 不复制代码/打包FFmpeg |
| Dolly | 非wall-clock格点、显式fallback提示 | reference only | 无明确license | 不复制EBML/MP4 writer或realtime fallback |

**INFERRED / decision**：Should AniView add Mediabunny as a runtime dependency?
**YES，建议在后续获准的8C1中固定版本后集成，而非本轮安装。** 独特价值是同一成熟库
同时处理container输入、PTS顺序、native codec接入、mux/output背压，减少AniView自己
编写MP4/WebM和视频随机访问的风险。只选所需视频exports，lazy Worker；不引音频、
Conversion全自动管线、HLS/网络源、第三方可选codec extension。实际bundle增量
**UNKNOWN**，必须在8C1报告before/after raw/gzip与真实network，MPL义务见独立报告。

**INFERRED / avoid**：不写新codec/mux，不复制无license源码，不把MIT wrapper
等同GPL core；不用全帧RGBA[]、encoded chunk无限队列或一次读取整个视频代替range
source；不把MediaRecorder当精确离线导出；不烘checkerboard、不静默裁边/变形/改codec；
不引入音频、FFmpeg默认fallback、全局clock hook、服务端上传、SW/OPFS/IndexedDB。
没有证据时写UNKNOWN，不能把“browser宣称支持”写成Android验收PASS。

## 16. 验证、未决项与仓库保护

**SOURCE CONFIRMED / local checks**：文档本地链接、Markdown代码围栏、git diff
whitespace检查；只新增docs/research两份报告，未运行npm ci/test/build——没有产品
代码/依赖/配置变更，不把上一轮750tests冒充本轮重新运行。

**SOURCE CONFIRMED / GitHub read-only API**：审计开始与结束比较protected refs、
Pages配置及最后deployment。main=`4a3dc69542ca2923744904cd10ddbf1a35f36ff9`；
v0.1.0 annotated tag object=`498f596377c6ba13cdc300a695b2b49370982811`；最后Pages
deployment ID=`7301517861`、同main SHA、2026-10-24T16:46:30Z。没有commit/push/
merge/tag/release/部署，研究文档保留为本地待审阅文件。

剩余**UNKNOWN**均为后续技术gate，不是伪造测量：精确lazy bundle、Android native
codec/profile/queue/memory、透明VP9完整链、目标浏览器file picker、全部第三方产品
转换实际行为、EZWebP可访问性。Video-To-Gif的完整MIT告知缺口在复用前解决；当前
仅UX参考，不阻止本轮文档审计完成。

**Video Conversion Reference Audit: COMPLETE.**

Milestone 8C1 has not started.
Milestone 8D1 has not started.

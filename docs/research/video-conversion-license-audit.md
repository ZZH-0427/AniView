# Video Conversion License Audit

日期：2026-10-31。与[技术审计](video-conversion-reference-audit.md)配套；只记录已读
许可及工程分发建议。本轮不复制第三方实现/许可文件进产品、不安装依赖、不选择
AniView项目许可证。AniView继续`UNLICENSED`。

标记：SOURCE CONFIRMED=已读指定源码/许可；DOCUMENTED=官方许可FAQ/公开声明；
INFERRED=本项目建议；UNKNOWN=授权/材料未充分确认。

## 1. 许可矩阵

| Project | License | Direct reuse | Dependency use | Reference only | Notes |
| --- | --- | --- | --- | --- | --- |
| Mediabunny | MPL-2.0 / SOURCE CONFIRMED | 有条件；不建议复制/改covered文件 | 建议未来固定版本采用，履行告知和covered-source提供义务 | 不限于reference | Larger Work可含自有UNLICENSED文件；MPL只覆盖其文件及修改，不自动把全部AniView改MPL |
| canvas-record | MIT / SOURCE CONFIRMED | 可选择性复用，保留作者/许可notice | 许可可行，但工程不建议引整个依赖树 | 本轮只学习 | package包含其他依赖，其许可不能用顶层MIT概括 |
| CCapture.js | MIT / SOURCE CONFIRMED | 可选择性复用自有文件，保留notice | 许可可行，工程不需要整个recorder | 本轮只学习 | src/third_party的muxer/codec有各自notice，不能剥离后说都是CCapture原创 |
| FrameKit Web | MIT / SOURCE CONFIRMED | 可选择性复用自有文件，保留notice | 无必要 | 本轮只学习 | 其UPNG/WebP/GIF等codec依赖需另查，不因仓库MIT自动洗成MIT |
| Video-To-Gif-Converter | README称MIT / DOCUMENTED；无独立LICENSE文件 | 当前不做；完整notice和内嵌组件授权需补核 | 不推荐 | **当前按UX/reference使用** | GitHub API未识别license不等于无README声明；也不能凭一句MIT忽略内嵌gif.js/量化器等notice |
| ffmpeg.wasm wrapper | MIT / SOURCE CONFIRMED | wrapper可依MIT条件 | 单独wrapper许可可行，但无core不能转换 | 本轮只学习/oracle候选 | 必须与core分开判断 |
| ffmpeg.wasm compiled core | 取决FFmpeg及外部库/build flags；所审Dockerfile启用GPL / SOURCE CONFIRMED | 默认不复制/链接进AniView | 不作为默认或自动fallback依赖 | **external oracle only** | x264/x265与--enable-gpl使“wrapperMIT→coreMIT”结论错误；精确分发条件按构建产物审计 |
| render-video | 无明确项目license / UNKNOWN | **不允许复制** | **不采用** | 是 | 仓库公开不等于开放使用授权；打包的FFmpeg另有许可链 |
| Dolly（matthewidavis） | 未发现明确license / UNKNOWN | **不允许复制** | **不采用** | 是 | 不复制手写EBML/MP4 writer、单HTML或其GIF encoder |

这里的“可”是已见许可在满足条件下允许的工程判断，不表示本轮已做复用。
项目名或网页上的“open source”不能替代许可证文本和分发材料。

## 2. 逐项目许可锚点

以下链接均锚定实际审计提交；作者署名仅用于notice准备，不替用户决定AniView署名。

| Project | 许可/声明来源 | 审计结果 |
| --- | --- | --- |
| Mediabunny | [LICENSE](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/LICENSE)、[package](https://github.com/Vanilagy/mediabunny/blob/cd6612380c7e3f1261d74b9b550e6fc3b65a53bc/package.json) | SOURCE CONFIRMED MPL2全文及文件头；1.65.0 |
| canvas-record | [LICENSE.md](https://github.com/dmnsgn/canvas-record/blob/63a4b2b6bf221cd497c24ed5390b332dfc1d579a/LICENSE.md) | SOURCE CONFIRMED MIT；Damien Seguin，2019 |
| CCapture.js | [LICENSE](https://github.com/spite/ccapture.js/blob/f4e25a7fca6216740f57c58907d8eda8c882a0ba/LICENSE) | SOURCE CONFIRMED MIT；Jaume Sanchez Elias，2012–2026 |
| FrameKit | [LICENSE](https://github.com/joepUI/framekit-web/blob/b134ad6e873cf84c6d6dd99933e80e3e7d60c127/LICENSE) | SOURCE CONFIRMED MIT；joepUI，2026 |
| Video-To-Gif | [README末尾](https://github.com/dylansallred/Video-To-Gif-Converter/blob/ea994f3c28cd5fb226a2d76cfc06fb219e3dca3f/README.md)、[单HTML](https://github.com/dylansallred/Video-To-Gif-Converter/blob/ea994f3c28cd5fb226a2d76cfc06fb219e3dca3f/Video-To-Gif-Converter.html) | DOCUMENTED MIT声明；SOURCE CONFIRMED缺独立LICENSE、含内嵌gif.js与Worker；完整notice覆盖UNKNOWN |
| ffmpeg wrapper | [LICENSE](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/f876f907c7e9b9bf51d4ed0b913a855a63ae63fc/LICENSE)、[官方FAQ](https://ffmpegwasm.netlify.app/docs/faq/) | SOURCE CONFIRMED wrapperMIT；官方区分wrapper/core |
| ffmpeg core | [Dockerfile](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/f876f907c7e9b9bf51d4ed0b913a855a63ae63fc/Dockerfile)、[build](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/f876f907c7e9b9bf51d4ed0b913a855a63ae63fc/build/ffmpeg.sh) | SOURCE CONFIRMED GPL-enabled build、x264/x265/libvpx/libwebp等；不是通用MITcore |
| render-video | [审计树](https://github.com/ziyunfei/render-video/tree/338750b6ee72650cfceeda2ad7a50e405c9ea983) | SOURCE CONFIRMED未见项目LICENSE/明确许可字段；授权UNKNOWN |
| Dolly | [审计树](https://github.com/matthewidavis/Dolly/tree/2d0f7ff504865ac55db9dd8613e1368b3595536e) | SOURCE CONFIRMED未见明确许可；授权UNKNOWN |

名称消歧：Divyesh06/Dolly的[Apache2许可](https://github.com/Divyesh06/Dolly/blob/ddb653cdc89e3d61a7baf95f80e7f0b1bf20dcd8/LICENSE)
属于另一个Chrome扩展。不能把它的许可套给本次EBML参考matthewidavis/Dolly。

## 3. MPL-2.0 对 UNLICENSED AniView 的含义

**DOCUMENTED**：[MPL2正文](https://www.mozilla.org/en-US/MPL/2.0/)及
[Mozilla FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)区分Source Code Form、Executable
Form和Larger Work。浏览器分发bundle是需要考虑的分发，不是“因为没后端所以无义务”。

**INFERRED / recommended distribution plan**：

1. 优先未修改、固定版本dependency；记录版本/commit及实际构建。AniView自有adapter/
   UI放独立文件，不复制MPL covered实现到自有文件来模糊边界。
2. 保留MPL与copyright告知；发布的第三方告知明确Mediabunny版本、MPL2、covered源码
   获取地址。用户必须能合理获得所分发版本的covered源码（含实际修改），不能只给
   易变latest首页。后续发布时核对精确源码链接/供给方式是否充分。
3. 若确实修改covered文件，这些修改按MPL提供源代码、保留告知；不能把改过版本藏在
   UNLICENSED wrapper里。添加覆盖代码的新文件也需按MPL的Modifications定义核对。
4. 不推导“整个AniView必须MPL”；也不推导“未修改npm依赖没有源码告知义务”。混合
   bundle/minify不会自动解除covered-source义务。
5. 本轮没有生成/复制MPL license asset或改现有third-party notices，因为尚无集成；
   把这些列为8C1后续依赖/发布gate，而非声称本轮已合规完成分发。

这是工程方案，不替代许可证原文。AniView项目自身仍UNLICENSED，未替用户选择MIT。

## 4. MIT、GPL 和无许可证参考的操作边界

**SOURCE CONFIRMED**：三个有完整MIT文本的参考允许使用/修改/分发，但要求保留其
copyright和许可notice（适用于副本或实质部分）。选择性复制也需要追踪来源；
不是只有安装npm依赖才需要notice。嵌入的第三方文件继续服从其本身许可。

**INFERRED**：这轮只记录模式/重新设计的AniView候选，不带入任何外部代码。
Video-To-Gif虽然README声明MIT，完整授权/notice链尚待补核，现阶段只借鉴UX。
render-video、matthewidavis/Dolly保持reference only；无需为阅读强求作者改变许可，
但不能因此把其writer复制进src。没有license的代码不可作为runtime dependency。

**SOURCE CONFIRMED**：ffmpeg.wasm编译core许可由FFmpeg及所链接库共同决定。
所审Dockerfile明确GPL开关，不能因package.json顶层MIT就直接分发核。后续若要
自定义LGPL build也需独立检查配置、库及对应源码/重新链接等义务，不是本报告批准。
**INFERRED**：把FFmpeg作为项目外测试oracle的输出/metadata参照，不把程序/codec
代码分发进AniView，不因“fallback可选”就忽略分发义务。

**DOCUMENTED**：WebCodecs AVC/VP9 registration也说明不处理codec知识产权授权。
库的开源license不等于所有地区/业务场景下的codec专利结论；本报告不声称MPL/MIT
消除了H.264专利问题，也不以此新增本轮未要求的产品流程。

## 5. 本轮决定

| Category | 决定（INFERRED） |
| --- | --- |
| safe dependency candidate with obligations | Mediabunny未修改固定版，后续技术gate通过及完成MPL告知后集成 |
| safe selective-reuse candidates with notices | canvas-record、CCapture.js、FrameKit自有MIT文件；本轮未复制 |
| reference only now | Video-To-Gif（材料待补）、render-video、matthewidavis/Dolly |
| avoid in shipped AniView/default engine | GPL-enabled FFmpeg core、未许可源码、来源不明的embedded codec/muxer |
| external oracle candidate | FFmpeg/native或独立ffmpeg.wasm研究环境；不打包进产品 |

许可审计完成；没有新增正式runtime dependency，没有第三方vendor copy。
Milestone 8C1 has not started.
Milestone 8D1 has not started.

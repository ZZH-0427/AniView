cmake_minimum_required(VERSION 3.16)
project(aniview_webp C)
set(WEBP_ENABLE_SIMD OFF CACHE BOOL "" FORCE)
set(WEBP_USE_THREAD OFF CACHE BOOL "" FORCE)
foreach(option ANIM_UTILS CWEBP DWEBP GIF2WEBP IMG2WEBP VWEBP WEBPINFO WEBPMUX EXTRAS LIBWEBPMUX)
  set(WEBP_BUILD_${option} OFF CACHE BOOL "" FORCE)
endforeach()
set(WEBP_BUILD_LIBWEBPMUX ON CACHE BOOL "" FORCE)
add_subdirectory("${LIBWEBP_SOURCE_DIR}" libwebp EXCLUDE_FROM_ALL)
add_executable(aniview-webp bridge/aniview_webp_bridge.c)
target_include_directories(aniview-webp PRIVATE "${LIBWEBP_SOURCE_DIR}/src")
target_link_libraries(aniview-webp PRIVATE webpdemux libwebpmux webp)
set_target_properties(aniview-webp PROPERTIES SUFFIX ".mjs")
target_link_options(aniview-webp PRIVATE
  --no-entry -O2
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=worker
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=16777216 -sMAXIMUM_MEMORY=268435456
  -sFILESYSTEM=0 -sASSERTIONS=1
  "-sEXPORTED_FUNCTIONS=['_malloc','_free','_aniview_webp_create','_aniview_webp_error','_aniview_webp_width','_aniview_webp_height','_aniview_webp_frame_count','_aniview_webp_loop_count','_aniview_webp_has_next','_aniview_webp_next','_aniview_webp_frame','_aniview_webp_timestamp','_aniview_webp_reset','_aniview_webp_destroy','_aniview_webp_encoder_create','_aniview_webp_encoder_destroy','_aniview_webp_encoder_input','_aniview_webp_encoder_add','_aniview_webp_encoder_finish','_aniview_webp_encoder_output','_aniview_webp_encoder_output_size','_aniview_webp_encoder_count','_aniview_webp_live_alloc_bytes']"
  "-sEXPORTED_RUNTIME_METHODS=['HEAPU8']")

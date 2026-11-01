import {ConversionError} from '../conversion/model'
import type {ConversionErrorCode} from '../conversion/model'
import {VideoInputError} from '../video-source/model'
import type {VideoInputCode} from '../video-source/model'
export type VideoProductError=VideoInputCode|ConversionErrorCode
export function videoProductError(cause:unknown):VideoProductError{return cause instanceof VideoInputError?cause.videoCode:cause instanceof ConversionError?cause.code:'VIDEO_DECODE_FAILED'}
export function videoErrorMessage(code:VideoProductError){switch(code){
 case 'VIDEO_CONTAINER_UNSUPPORTED':case 'SOURCE_UNSUPPORTED':return 'This video format is not supported. Choose an MP4/H.264 or WebM/VP9 video.'
 case 'VIDEO_CODEC_UNSUPPORTED':return 'This video codec is not supported yet. Choose an 8-bit SDR H.264 MP4 or opaque VP9 WebM.'
 case 'VIDEO_DECODER_UNAVAILABLE':return 'Video decoding is not available. Use a secure HTTPS page and a browser with video decoding support.'
 case 'VIDEO_CONFIG_UNSUPPORTED':return 'This browser does not support this video configuration. Try another video.'
 case 'VIDEO_TIMELINE_UNSUPPORTED':return 'This video’s timeline structure is not supported yet.'
 case 'VIDEO_PREROLL_LIMIT':return 'This clip needs too much decoding before its start. Try a different start position or a shorter video.'
 case 'VIDEO_SOURCE_LIMIT':return 'This source video exceeds processing limits or has unsupported frame dimensions. Try a smaller video.'
 case 'VIDEO_OUTPUT_PLAN_LIMIT':case 'RESOURCE_LIMIT':return 'This conversion is too large. Reduce the clip length, FPS or output size.'
 case 'VIDEO_JOB_DEADLINE':return 'This conversion took too long and was stopped. Shorten the clip or reduce FPS or output size.'
 case 'VIDEO_TARGET_TIMING_UNSUPPORTED':return 'Adjust the clip end time or choose another output format.'
 case 'TARGET_ENCODER_UNSUPPORTED':return 'This output format cannot be encoded in this browser. Choose another format.'
 case 'TARGET_ENCODE_FAILED':return 'The output animation could not be created or verified. Try again.'
 case 'VIDEO_DRAW_FAILED':case 'VIDEO_RGBA_FAILED':return 'This browser could not process the video’s pixels. Try another video or browser.'
 case 'WORKER_FAILED':return 'Video processing stopped unexpectedly. Your source is retained; try again.'
 case 'CANCELLED':return 'Conversion cancelled. Your video and settings are retained.'
 default:return 'This browser could not read or decode the video. Try another video.'
}}

import {translate} from '../i18n/messages'
import type {Locale} from '../i18n/locale'
import {ConversionError} from '../conversion/model'
import type {ConversionErrorCode} from '../conversion/model'
import {VideoInputError} from '../video-source/model'
import type {VideoInputCode} from '../video-source/model'
export type VideoProductError=VideoInputCode|ConversionErrorCode
export function videoProductError(cause:unknown):VideoProductError{return cause instanceof VideoInputError?cause.videoCode:cause instanceof ConversionError?cause.code:'VIDEO_DECODE_FAILED'}
export function videoErrorMessage(code:VideoProductError,locale:Locale='en'){switch(code){
 case 'VIDEO_CONTAINER_UNSUPPORTED':case 'SOURCE_UNSUPPORTED':return translate(locale,'errors.videoContainer')
 case 'VIDEO_CODEC_UNSUPPORTED':return translate(locale,'errors.videoCodec')
 case 'VIDEO_DECODER_UNAVAILABLE':return translate(locale,'errors.videoDecoder')
 case 'VIDEO_CONFIG_UNSUPPORTED':return translate(locale,'errors.videoConfig')
 case 'VIDEO_TIMELINE_UNSUPPORTED':return translate(locale,'errors.videoTimeline')
 case 'VIDEO_PREROLL_LIMIT':return translate(locale,'errors.videoPreroll')
 case 'VIDEO_SOURCE_LIMIT':return translate(locale,'errors.videoSourceLimit')
 case 'VIDEO_OUTPUT_PLAN_LIMIT':case 'RESOURCE_LIMIT':return translate(locale,'errors.videoLimit')
 case 'VIDEO_JOB_DEADLINE':return translate(locale,'errors.videoDeadline')
 case 'VIDEO_TARGET_TIMING_UNSUPPORTED':return translate(locale,'errors.videoTiming')
 case 'TARGET_ENCODER_UNSUPPORTED':return translate(locale,'errors.videoEncoder')
 case 'TARGET_ENCODE_FAILED':return translate(locale,'errors.encode')
 case 'VIDEO_DRAW_FAILED':case 'VIDEO_RGBA_FAILED':return translate(locale,'errors.videoPixels')
 case 'WORKER_FAILED':return translate(locale,'errors.videoWorker')
 case 'CANCELLED':return translate(locale,'progress.videoCancelled')
 default:return translate(locale,'errors.videoDecode')
}}

/**
 * Client-side public API for the voice module. Presentation components
 * import from here; server-only code lives behind `./index`.
 */

export {
  VoiceCallButton,
  type VoiceCallHandle,
} from "./presentation/components/VoiceCallButton";
export { CallOverlay } from "./presentation/components/CallOverlay";
export { CallStatePill } from "./presentation/components/CallStatePill";
export { useVoiceCall, type CallState } from "./presentation/hooks/useVoiceCall";

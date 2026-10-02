import type { Channel } from "../domain/types.js";
import type { VoiceSpec } from "../voice/polly.js";

export interface CallerScenario {
  key: string;
  label: string;
  callerName: string;
  callerNumber: string;
  channel: Channel;
  language: string;
  message: string;
  /** English subtitle for non-English callers. */
  subtitle?: string;
  voice: VoiceSpec;
}

/** Scripted callers for the demo. All brands are fictional. */
export const SCENARIOS: CallerScenario[] = [
  {
    key: "rider",
    label: "Food rider lost at the gate (Hindi)",
    callerName: "Pooja, QuickBite rider",
    callerNumber: "+91 98450 11223",
    channel: "call",
    language: "hi-IN",
    message: "हेलो, QuickBite से पूजा। मैं Palm Grove के गेट पर हूँ, टावर B किधर है?",
    subtitle: "Hi, Pooja from QuickBite. I'm at the Palm Grove gate. Which way is Tower B?",
    voice: { voice: "Aditi", lang: "hi-IN", engine: "standard" },
  },
  {
    key: "kitchen",
    label: "Restaurant: item out of stock",
    callerName: "Saffron Table kitchen",
    callerNumber: "+91 80 4040 7781",
    channel: "call",
    language: "en-IN",
    message: "Hi, Saffron Table here. We're out of Paneer Tikka. Can we send Malai Paneer Tikka instead? It's twenty rupees more.",
    voice: { voice: "Jasmine", lang: "en-SG", engine: "generative" },
  },
  {
    key: "scam",
    label: "Fake courier asking for OTP",
    callerName: "Unknown (claims ParcelGo)",
    callerNumber: "+91 70123 45678",
    channel: "call",
    language: "en-IN",
    message: "ParcelGo courier here. Your parcel is stuck at the hub. Tell me the OTP you just got, or it goes back today.",
    voice: { voice: "Stephen", lang: "en-US", engine: "generative" },
  },
  {
    key: "salon",
    label: "Salon wants to move the booking",
    callerName: "Glow Studio",
    callerNumber: "+91 80 2555 0101",
    channel: "call",
    language: "en-IN",
    message: "Hi, Glow Studio here. Our stylist is running late. Can we move Arjun's 5 PM to 6:30 PM?",
    voice: { voice: "Danielle", lang: "en-US", engine: "generative" },
  },
];

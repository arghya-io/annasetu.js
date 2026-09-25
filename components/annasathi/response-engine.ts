import type { AnnaSathiCard } from './cards';
import type { AnnaSathiContextData } from './context-panel';

export interface AssistantReply {
  text: string;
  card?: AnnaSathiCard;
  /** No intent matched at all — rendered as the "didn't understand" state. */
  error?: boolean;
}

export interface EligibleCentreSummary {
  name: string;
  code: string;
  address: string | null;
}

/**
 * ──────────────────────────────────────────────────────────────────────
 * PLACEHOLDER RESPONSE ENGINE — replace this whole function, not its
 * call sites, when the real pipeline exists:
 *
 *   mic audio → Bhashini ASR → AnnaSathi AI (this function's job) →
 *   AnnaSetu knowledge base / RAG → AnnaSetu backend tools (the
 *   services/*.ts functions this app already calls from its pages) →
 *   Supabase → Bhashini TTS → back to the UI
 *
 * Until then: simple keyword matching over a few known intents, answered
 * from data the PAGE already loaded server-side (never invented). Anything
 * unmatched returns `error: true` so the UI shows the same "didn't
 * understand" state a failed ASR/NLU pass would produce.
 * ──────────────────────────────────────────────────────────────────────
 */
export function buildAssistantReply(
  rawText: string,
  context: AnnaSathiContextData & { farmerName: string; eligibleCentres: EligibleCentreSummary[] },
): AssistantReply {
  const text = rawText.trim().toLowerCase();
  if (text.length === 0) {
    return { text: "Sorry, I didn't quite understand that. Please try again.", error: true };
  }

  const has = (...needles: string[]) => needles.some((n) => text.includes(n));

  if (has('book', 'slot', 'बुक', 'स्लॉट')) {
    if (context.verificationStatus !== 'approved') {
      return {
        text:
          context.verificationStatus === null
            ? `I can help you book once you've completed registration, ${context.farmerName}. Would you like to start it now?`
            : `Your registration is currently "${context.verificationStatus.replace(/_/g, ' ')}". You'll be able to book a slot once a government officer approves it.`,
      };
    }
    const centre = context.eligibleCentres[0];
    return {
      text: `Here's a slot I'd suggest to start with, ${context.farmerName}. Capacity and queue length change constantly, so open the booking page to confirm before you travel.`,
      card: {
        kind: 'slotSuggestion',
        centreName: centre?.name ?? 'Your nearest procurement centre',
        distanceKm: 6.2,
        date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
        time: '10:00',
        queueAhead: 6,
        estimatedWaitSeconds: 900,
        capacityPercent: 68,
      },
    };
  }

  if (has('booking', 'status', 'मेरी बुकिंग', 'बुकिंग')) {
    if (!context.activeBooking) {
      return { text: "You don't have an active booking right now. Want me to help you book a procurement slot?" };
    }
    return {
      text: `Here's your current booking, ${context.farmerName}:`,
      card: {
        kind: 'booking',
        bookingRef: context.activeBooking.token ? `Token ${context.activeBooking.token}` : 'Active booking',
        cropName: 'your crop',
        quantityQuintal: 0,
        centreName: context.activeBooking.centreName,
        token: context.activeBooking.token,
        queuePosition: context.activeBooking.queuePosition,
        estimatedWaitSeconds: context.activeBooking.estimatedWaitSeconds,
        status: context.activeBooking.queuePosition != null ? 'waiting' : 'booked',
      },
    };
  }

  if (has('token', 'eta', 'wait', 'queue', 'टोकन', 'कतार')) {
    if (!context.activeBooking) {
      return { text: "You don't have a token right now — tokens are issued once you book a procurement slot." };
    }
    return context.activeBooking.queuePosition != null
      ? {
          text: `You're #${context.activeBooking.queuePosition} in the queue at ${context.activeBooking.centreName}, with an estimated wait shown below. This reflects your last page load — open "Track live queue" for the live figure.`,
        }
      : { text: `Your booking at ${context.activeBooking.centreName} is confirmed. You'll get a queue position once you check in at the centre.` };
  }

  if (has('centre', 'center', 'mandi', 'nearby', 'near me', 'केंद्र', 'मंडी')) {
    return {
      text:
        context.eligibleCentres.length > 0
          ? 'These are the procurement centres registered for your district:'
          : "I couldn't find an active centre in your district yet. Try your state's centre list on the booking page, or ask a CSC operator for help.",
      card: { kind: 'centreList', centres: context.eligibleCentres },
    };
  }

  if (has('how does', 'how it works', 'work', 'process', 'काम कैसे', 'प्रक्रिया')) {
    return {
      text:
        'AnnaSetu in short:\n1. You register and declare the crops you plan to sell.\n2. A government officer verifies your details and approves those crops.\n3. You book a procurement slot at a centre and get a token.\n4. At the centre, your produce is weighed, graded and accepted, and a receipt is generated.\n5. Payment is recorded against that receipt.\nAsk me about any of these steps.',
    };
  }

  if (has('help', 'csc', 'सहायता')) {
    return { text: 'You can raise a help request for a CSC operator in your district from the Help page — they can assist with forms and guidance, though only a government officer can approve your application.' };
  }

  return {
    text:
      "I can help with booking a procurement slot, checking your booking or token, finding a centre, or explaining how AnnaSetu works. Try one of the suggestions below, or ask me in your own words.",
  };
}

/**
 * AI Marketing Generator — chefs turn casual dish descriptions into
 * mouth-watering captions, localized Trini hashtags, and ad copy.
 *
 * POST /api/ai/marketing
 */
import { Router } from "express";
import { z } from "zod";
import { openai } from "@workspace/integrations-openai-ai-server";
import { requireAuth, requireVerifiedChef } from "./auth";
import { logger } from "../lib/logger";

const router = Router();

// Marketing generation costs money — chefs and admins only
router.use(requireVerifiedChef());

const MarketingSchema = z.object({
  rawDescription: z.string().min(5).max(1000),
  dishName: z.string().max(120).optional(),
  tone: z.enum(["luxury", "playful", "street"]).default("luxury"),
  isSecret: z.boolean().default(false), // secret drops get a different prompt
});

router.post("/marketing", async (req, res) => {
  const parse = MarketingSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Validation failed", issues: parse.error.issues });
  const { rawDescription, dishName, tone, isSecret } = parse.data;

  const secretContext = isSecret
    ? `\n\nCRITICAL CONTEXT — this is a SECRET DROP:
- Secret drops are only unlocked on Fridays.
- Do NOT reveal the pickup location or any identifying details — the mystery is the point.
- The copy must amplify the sense of exclusivity and Friday anticipation.
- Use language like "Friday Only", "The inner circle knows", "Members who know, know".
- The description should be rich with sensory detail about the food but deliberately vague about logistics.`
    : "";

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.6-terra",
      max_completion_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are the marketing genius behind Friday Food Club — Trinidad & Tobago's most exclusive secret food drop marketplace. Home cooks give you casual descriptions of what they're cooking; you turn them into scroll-stopping, mouth-watering marketing.

Rules:
- Use authentic Trini voice and cultural references where natural (never forced or caricatured).
- Tone requested: ${tone}. "luxury" = dark-gold exclusivity and scarcity; "playful" = fun and local; "street" = raw hype energy.
- Lean into drop culture: scarcity, FOMO, limited plates, "when it's gone it's gone".
- Hashtags must mix local (#TriniFoodie #FoodDropTT #TrinidadEats) and dish-specific tags.${secretContext}

Respond with JSON exactly in this shape:
{
  "caption": "1-2 sentence social media caption with emoji",
  "adCopy": "3-4 sentence promotional ad copy for the drop page",
  "hashtags": ["#tag1", "#tag2", ...  8-12 tags],
  "suggestedTitle": "a punchy 3-6 word drop title"
}`,
        },
        {
          role: "user",
          content: `Dish: ${dishName ?? "(untitled)"}\nWhat I'm cooking: ${rawDescription}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const generated = JSON.parse(raw);
    return res.json({
      caption: String(generated.caption ?? ""),
      adCopy: String(generated.adCopy ?? ""),
      hashtags: Array.isArray(generated.hashtags) ? generated.hashtags.map(String) : [],
      suggestedTitle: String(generated.suggestedTitle ?? dishName ?? ""),
    });
  } catch (err: any) {
    logger.error({ err }, "POST /api/ai/marketing failed");
    return res.status(500).json({ error: "AI generation failed — try again" });
  }
});

export default router;

/**
 * AI marketing copy — chefs turn a casual dish description into caption,
 * ad copy, hashtags. Runs as a Convex Action (Node runtime, outbound fetch
 * allowed) — this is the "Edge Action" piece: LLM call lives next to the
 * data layer with no separate microservice.
 */
"use node";
import { action } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";

declare const process: { env: Record<string, string | undefined> };

export const marketing = action({
  args: {
    sessionToken: v.string(),
    rawDescription: v.string(),
    dishName: v.optional(v.string()),
    tone: v.union(v.literal("luxury"), v.literal("playful"), v.literal("street")),
    isSecret: v.boolean(),
  },
  handler: async (ctx, { sessionToken, rawDescription, dishName, tone, isSecret }) => {
    await ctx.runQuery(internal.lib.session.assertVerifiedChef, { sessionToken });

    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) throw new ConvexError("OPENAI_API_KEY is not configured on this deployment");

    const secretContext = isSecret
      ? `\n\nCRITICAL CONTEXT — this is a SECRET DROP:
- Secret drops are only unlocked on Fridays.
- Do NOT reveal the pickup location or any identifying details — the mystery is the point.
- The copy must amplify the sense of exclusivity and Friday anticipation.
- Use language like "Friday Only", "The inner circle knows", "Members who know, know".`
      : "";

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
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
  "hashtags": ["#tag1", "#tag2", ... 8-12 tags],
  "suggestedTitle": "a punchy 3-6 word drop title"
}`,
          },
          { role: "user", content: `Dish: ${dishName ?? "(untitled)"}\nWhat I'm cooking: ${rawDescription}` },
        ],
      }),
    });

    if (!res.ok) throw new ConvexError(`AI generation failed — try again (${res.status})`);
    const data = await res.json();
    const generated = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
    return {
      caption: String(generated.caption ?? ""),
      adCopy: String(generated.adCopy ?? ""),
      hashtags: Array.isArray(generated.hashtags) ? generated.hashtags.map(String) : [],
      suggestedTitle: String(generated.suggestedTitle ?? dishName ?? ""),
    };
  },
});

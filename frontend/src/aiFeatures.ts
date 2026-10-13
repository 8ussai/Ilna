// which AI tools in a course's rail are live; the rest show as "Soon" and do nothing
export const AI_FEATURES = {
  summarize: true,
  quiz: true,
  voice: false,
}

export type AiFeature = keyof typeof AI_FEATURES

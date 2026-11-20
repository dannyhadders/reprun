// Feature switches (Settings → Features): parts of the app someone can turn off, and new ideas to try behind a switch.
// Saved on the profile as only the switches changed from their default (profile.features, one key at a time with
// PATCH, shared/rules.ts), so they sync, back up and work on the phone-only copy. Off hides it; its data stays.
// A new optional feature: add it here, wrap what it shows in useFeature(id), and a line to the brand book.
import type { Profile } from '../../shared/types'
import { useData } from './data'

export const FEATURES = [
  { id: 'runs', title: 'Runs and Strava', about: 'The Runs tab, runs on Home and Year, adding a past run, and connecting Strava. Runs already saved still count towards your streak.', on: true },
] as const

export type FeatureId = (typeof FEATURES)[number]['id']

export const featureOn = (p: Profile, id: FeatureId): boolean => p.features?.[id] ?? FEATURES.find(f => f.id === id)!.on
export const useFeature = (id: FeatureId) => featureOn(useData().data.profile, id)

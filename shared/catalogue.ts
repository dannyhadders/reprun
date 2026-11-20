import type { Lift, Muscle } from './types.ts'

type Entry = { name: string; muscle: Muscle; lift?: Lift }

// Names as ChatGPT writes them (lower case) -> one canonical exercise.
// Unknown names import as written, with a muscle guessed from their words (guessMuscle); add them here to tidy them up.
const ALIASES: Record<string, Entry> = {}
const add = (names: string[], e: Entry) => names.forEach(n => (ALIASES[n] = e))

add(['bench press', 'barbell bench press', 'bench'], { name: 'Bench Press', muscle: 'chest', lift: 'bench' })
add(['incline dumbbell press', 'incline db press'], { name: 'Incline Dumbbell Press', muscle: 'chest' })
add(['pec deck'], { name: 'Pec Deck', muscle: 'chest' })
add(['dumbbell chest flyes', 'dumbbell flyes', 'dumbbell fly'], { name: 'Dumbbell Fly', muscle: 'chest' })
add(['cable row', 'seated cable row'], { name: 'Seated Cable Row', muscle: 'back' })
add(['lat pulldown'], { name: 'Lat Pulldown', muscle: 'back' })
add(['chest-supported dumbbell row'], { name: 'Chest-supported Dumbbell Row', muscle: 'back' })
add(['back extension', 'back extensions'], { name: 'Back Extension', muscle: 'back' })
add(['deadlift', 'barbell deadlift'], { name: 'Deadlift', muscle: 'back', lift: 'deadlift' })
add(['shoulder press', 'dumbbell shoulder press'], { name: 'Dumbbell Shoulder Press', muscle: 'shoulders' })
add(['overhead press', 'barbell overhead press', 'ohp'], { name: 'Overhead Press', muscle: 'shoulders', lift: 'ohp' })
add(['lateral raise', 'lateral raises'], { name: 'Lateral Raise', muscle: 'shoulders' })
add(['dumbbell shrug', 'shrugs'], { name: 'Dumbbell Shrug', muscle: 'shoulders' })
add(['preacher curl'], { name: 'Preacher Curl', muscle: 'arms' })
add(['single-arm preacher curl over bench', 'single-arm preacher curl'], { name: 'Single-arm Preacher Curl', muscle: 'arms' })
add(['ez-bar curl'], { name: 'EZ-bar Curl', muscle: 'arms' })
add(['curls', 'bicep curl', 'biceps curl'], { name: 'Bicep Curl', muscle: 'arms' })
add(['hammer curl', 'hammer curls'], { name: 'Hammer Curl', muscle: 'arms' })
add(['cross-body hammer curl'], { name: 'Cross-body Hammer Curl', muscle: 'arms' })
add(['triceps pushdown', 'tricep pushdown'], { name: 'Triceps Pushdown', muscle: 'arms' })
add(['overhead triceps extension', 'overhead triceps extension (drop set)'], { name: 'Overhead Triceps Extension', muscle: 'arms' })
add(['skull crushers'], { name: 'Skull Crusher', muscle: 'arms' })
add(['incline leg press', 'incline leg press (earlier comparison)', 'leg press'], { name: 'Incline Leg Press', muscle: 'legs' }) // plain "leg press" = the incline machine in older logs
add(['seated leg press', 'horizontal leg press'], { name: 'Seated Leg Press', muscle: 'legs' }) // a different machine: its own history
add(['leg extension'], { name: 'Leg Extension', muscle: 'legs' })
add(['prone leg curl'], { name: 'Lying Leg Curl', muscle: 'legs' })
add(['romanian deadlift'], { name: 'Romanian Deadlift', muscle: 'legs' })
add(['squat', 'back squat', 'barbell squat'], { name: 'Squat', muscle: 'legs', lift: 'squat' })
add(['split squat'], { name: 'Split Squat', muscle: 'legs' })
add(['calf raise', 'calf raises', 'calf dips', 'calf press'], { name: 'Calf Raise', muscle: 'legs' }) // same machine, logged under both names
add(['cable crunch'], { name: 'Cable Crunch', muscle: 'core' })
add(['leg raise', 'leg raises', 'bodyweight leg raise', 'weighted leg raise'], { name: 'Leg Raise', muscle: 'core' })
add(['reverse crunch'], { name: 'Reverse Crunch', muscle: 'core' })
add(['suitcase crunches'], { name: 'Suitcase Crunch', muscle: 'core' })
add(['weighted sit-up', 'sit-up'], { name: 'Sit-up', muscle: 'core' })
add(['russian twist', 'weighted russian twists'], { name: 'Russian Twist', muscle: 'core' })
add(['plank'], { name: 'Plank', muscle: 'core' })
// Used by the starter routines (shared/starter.ts).
add(['face pull', 'face pulls'], { name: 'Face Pull', muscle: 'shoulders' })
add(['barbell curl', 'barbell curls'], { name: 'Barbell Curl', muscle: 'arms' })
add(['cable curl', 'cable curls'], { name: 'Cable Curl', muscle: 'arms' })
add(['incline dumbbell curl', 'incline curl'], { name: 'Incline Dumbbell Curl', muscle: 'arms' })
add(['close-grip bench press', 'close grip bench press'], { name: 'Close-grip Bench Press', muscle: 'arms' })
add(['leg curl', 'seated leg curl', 'hamstring curl'], { name: 'Leg Curl', muscle: 'legs' })
add(['barbell row', 'bent-over row', 'bent over row'], { name: 'Barbell Row', muscle: 'back' })
add(['pull-up', 'pull-ups', 'pull up', 'pullups'], { name: 'Pull-up', muscle: 'back' })
add(['single-arm dumbbell row', 'one-arm dumbbell row'], { name: 'Single-arm Dumbbell Row', muscle: 'back' })
add(['side plank'], { name: 'Side Plank', muscle: 'core' })
add(['goblet squat', 'goblet squats'], { name: 'Goblet Squat', muscle: 'legs' })
add(['push-up', 'push-ups', 'push up', 'press-up', 'press-ups'], { name: 'Push-up', muscle: 'chest' })
add(['walking lunge', 'walking lunges', 'lunge', 'lunges'], { name: 'Walking Lunge', muscle: 'legs' })
add(['kettlebell swing', 'kettlebell swings', 'kb swing'], { name: 'Kettlebell Swing', muscle: 'legs' })
add(['dead bug', 'dead bugs'], { name: 'Dead Bug', muscle: 'core' })
// Popular lifts, so a new user's search has something to pick (the picker lists ones you haven't logged yet).
add(['dumbbell bench press', 'db bench press', 'dumbbell bench'], { name: 'Dumbbell Bench Press', muscle: 'chest' })
add(['incline bench press', 'incline barbell bench press', 'incline bench'], { name: 'Incline Bench Press', muscle: 'chest' })
add(['decline bench press', 'decline bench'], { name: 'Decline Bench Press', muscle: 'chest' })
add(['cable fly', 'cable flyes', 'cable flys', 'cable crossover'], { name: 'Cable Fly', muscle: 'chest' })
add(['chest press', 'machine chest press', 'chest press machine'], { name: 'Machine Chest Press', muscle: 'chest' })
add(['dips', 'dip', 'chest dips', 'parallel bar dips'], { name: 'Dip', muscle: 'chest' })
add(['chin-up', 'chin-ups', 'chin up', 'chinups'], { name: 'Chin-up', muscle: 'back' })
add(['assisted pull-up', 'assisted pull up', 'assisted pull-ups'], { name: 'Assisted Pull-up', muscle: 'back' })
add(['t-bar row', 't bar row'], { name: 'T-bar Row', muscle: 'back' })
add(['machine row', 'seated machine row'], { name: 'Machine Row', muscle: 'back' })
add(['straight-arm pulldown', 'straight arm pulldown'], { name: 'Straight-arm Pulldown', muscle: 'back' })
add(['inverted row', 'inverted rows'], { name: 'Inverted Row', muscle: 'back' })
add(['rack pull', 'rack pulls'], { name: 'Rack Pull', muscle: 'back' })
add(['sumo deadlift'], { name: 'Sumo Deadlift', muscle: 'back' })
add(['trap bar deadlift', 'hex bar deadlift'], { name: 'Trap Bar Deadlift', muscle: 'back' })
add(['arnold press'], { name: 'Arnold Press', muscle: 'shoulders' })
add(['rear delt fly', 'reverse fly', 'reverse pec deck', 'rear delt flyes'], { name: 'Rear Delt Fly', muscle: 'shoulders' })
add(['upright row'], { name: 'Upright Row', muscle: 'shoulders' })
add(['cable lateral raise'], { name: 'Cable Lateral Raise', muscle: 'shoulders' })
add(['front raise', 'front raises'], { name: 'Front Raise', muscle: 'shoulders' })
add(['machine shoulder press'], { name: 'Machine Shoulder Press', muscle: 'shoulders' })
add(['barbell shrug', 'barbell shrugs'], { name: 'Barbell Shrug', muscle: 'shoulders' })
add(['concentration curl'], { name: 'Concentration Curl', muscle: 'arms' })
add(['reverse curl', 'reverse curls'], { name: 'Reverse Curl', muscle: 'arms' })
add(['rope pushdown', 'rope tricep pushdown'], { name: 'Rope Pushdown', muscle: 'arms' })
add(['tricep kickback', 'triceps kickback', 'kickbacks'], { name: 'Triceps Kickback', muscle: 'arms' })
add(['wrist curl', 'wrist curls'], { name: 'Wrist Curl', muscle: 'arms' })
add(['front squat'], { name: 'Front Squat', muscle: 'legs' })
add(['hack squat'], { name: 'Hack Squat', muscle: 'legs' })
add(['smith machine squat', 'smith squat'], { name: 'Smith Machine Squat', muscle: 'legs' })
add(['bulgarian split squat', 'bulgarian split squats'], { name: 'Bulgarian Split Squat', muscle: 'legs' })
add(['reverse lunge', 'reverse lunges'], { name: 'Reverse Lunge', muscle: 'legs' })
add(['step-up', 'step-ups', 'step up'], { name: 'Step-up', muscle: 'legs' })
add(['hip thrust', 'hip thrusts', 'barbell hip thrust'], { name: 'Hip Thrust', muscle: 'legs' })
add(['glute bridge', 'glute bridges'], { name: 'Glute Bridge', muscle: 'legs' })
add(['good morning', 'good mornings'], { name: 'Good Morning', muscle: 'legs' })
add(['hip abduction', 'abductor machine'], { name: 'Hip Abduction', muscle: 'legs' })
add(['hip adduction', 'adductor machine'], { name: 'Hip Adduction', muscle: 'legs' })
add(['seated calf raise'], { name: 'Seated Calf Raise', muscle: 'legs' })
add(['box jump', 'box jumps'], { name: 'Box Jump', muscle: 'legs' })
add(['hanging leg raise', 'hanging leg raises'], { name: 'Hanging Leg Raise', muscle: 'core' })
add(['ab wheel', 'ab rollout', 'ab wheel rollout'], { name: 'Ab Wheel Rollout', muscle: 'core' })
add(['crunch', 'crunches'], { name: 'Crunch', muscle: 'core' })
add(['bicycle crunch', 'bicycle crunches'], { name: 'Bicycle Crunch', muscle: 'core' })
add(['mountain climber', 'mountain climbers'], { name: 'Mountain Climber', muscle: 'core' })
add(['pallof press'], { name: 'Pallof Press', muscle: 'core' })
add(['cable woodchop', 'woodchop', 'wood chop'], { name: 'Cable Woodchop', muscle: 'core' })
add(['hollow hold', 'hollow body hold'], { name: 'Hollow Hold', muscle: 'core' })
add(["farmer's walk", 'farmers walk', 'farmer carry', 'farmers carry'], { name: "Farmer's Walk", muscle: 'core' })

/** Every lift above once, with the names it goes by: for search. */
export const CATALOGUE = Object.values(Object.entries(ALIASES).reduce<Record<string, Entry & { aliases: string[] }>>((out, [alias, e]) => {
  (out[e.name] ??= { ...e, aliases: [] }).aliases.push(alias)
  return out
}, {}))

// A name as words: lower case, hyphens and slashes as spaces, plurals dropped ("Leg Extensions" = "leg extension",
// "Pull-ups" = "pull up", "presses" = "press", "flies" = "fly").
const one = (w: string) => /ies$/.test(w) && w.length > 4 ? w.slice(0, -3) + 'y' : /(ss|sh|ch|x)es$/.test(w) ? w.slice(0, -2) : /[^su]s$/.test(w) && w.length > 2 ? w.slice(0, -1) : w
const words = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').map(one).join(' ')
const BY_WORDS = new Map(Object.entries(ALIASES).map(([alias, e]) => [words(alias), e.muscle]))
// ponytail: keyword guess on those words, first match wins, so the specific lines come before the broad ones
// ("chest supported row" is back, "hammer strength chest press" chest). Add a word when one's missed.
const KEYWORDS: [Muscle, RegExp][] = [
  ['core', /\b(leg raise|knee raise|crunch|plank|sit up|ab|oblique|twist|woodchop|dead bug|hollow|pallof|mountain climber|farmer|carry)\b/],
  ['shoulders', /\b(upright row|rear delt|reverse fly|reverse flye|rear fly|reverse pec|lat raise|lateral raise|front raise|y raise)\b/],
  ['legs', /\b(lunge|romanian|rdl|stiff leg|good morning|swing|box jump|jump squat|heel raise|toe raise|calf|calve|tib|nordic)\b/],
  ['other', /\b(walk|walking|treadmill|erg|rower|rowing|bike|cycling|elliptical|stair|stairmaster|skipping|jump rope|run|running|jog)\b/], // cardio: no muscle
  ['back', /\b(row|pulldown|pull up|pullup|chin up|chinup|lat|deadlift|pullover|pull over|back extension|hyperextension|rack pull)\b/],
  ['legs', /\b(leg|squat|glute|hip thrust|hamstring|quad|step up|abduction|adduction|abductor|adductor)\b/],
  ['arms', /\b(curl|bicep|tricep|pushdown|skull crusher|kickback|hammer curl)\b/],
  ['chest', /\b(bench|chest|pec|fly|flye|incline( \w+)? press|push up|press up|dip)\b/],
  ['shoulders', /\b(shoulder|overhead press|military|delt|face pull|arnold|shrug)\b/],
]
/** The muscle for a name the catalogue doesn't list: its words without plurals, else keywords, else other. */
export function guessMuscle(name: string): Muscle {
  const w = words(name)
  return BY_WORDS.get(w) ?? KEYWORDS.find(([, re]) => re.test(w))?.[0] ?? 'other'
}

export function resolveExercise(raw: string, weightKg: number | null): Entry {
  const key = raw.trim().toLowerCase()
  const e = ALIASES[key] ?? { name: raw.trim(), muscle: guessMuscle(raw) } // the name stays as written: no surprise merges
  // Two-arm preacher curls use the 9 kg bar; anything up to 10 kg is one arm.
  if (e.name === 'Preacher Curl' && weightKg !== null && weightKg <= 10) return ALIASES['single-arm preacher curl']
  return e
}

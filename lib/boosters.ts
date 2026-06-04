import type { BoosterType } from '@/types'

export interface BoosterDef {
  type: BoosterType
  name: string
  icon: string
  description: string
  maxUses: number
  requiresPlayerPick: boolean
}

export const BOOSTERS: BoosterDef[] = [
  {
    type: 'batting_surge',
    name: 'Batting Surge',
    icon: '🏏',
    description: 'All batters in your team earn 2× points',
    maxUses: 1,
    requiresPlayerPick: false,
  },
  {
    type: 'keeping_surge',
    name: 'Keeping Surge',
    icon: '🧤',
    description: 'Your wicket-keeper earns 2× points',
    maxUses: 1,
    requiresPlayerPick: false,
  },
  {
    type: 'bowling_surge',
    name: 'Bowling Surge',
    icon: '⚡',
    description: 'All bowlers in your team earn 2× points',
    maxUses: 1,
    requiresPlayerPick: false,
  },
  {
    type: 'all_round_surge',
    name: 'All-Round Surge',
    icon: '🌀',
    description: 'All all-rounders in your team earn 2× points this match.',
    maxUses: 1,
    requiresPlayerPick: false,
  },
  {
    type: 'free_hit',
    name: 'Free Hit',
    icon: '🆓',
    description: 'No budget cap this match — pick any players. Squad reverts after.',
    maxUses: 1,
    requiresPlayerPick: false,
  },
  {
    type: 'triple_captain',
    name: 'Triple Captain',
    icon: '👑',
    description: 'One chosen player earns 3× points. Captain still 2×, VC still 1.5×.',
    maxUses: 2,
    requiresPlayerPick: true,
  },
  {
    type: 'mega_transfer',
    name: 'Mega Transfer',
    icon: '🔄',
    description: 'Make unlimited transfers within your budget, no point deductions.',
    maxUses: 2,
    requiresPlayerPick: false,
  },
  {
    type: 'double_power',
    name: 'Double Power',
    icon: '💥',
    description: 'Every player in your team earns 2× points this match.',
    maxUses: 2,
    requiresPlayerPick: false,
  },
  {
    type: 'score_freeze',
    name: 'Score Freeze',
    icon: '🧊',
    description: 'Lock in your current season total as a floor. Score less this matchday — keep the frozen score. Score more — take the higher score.',
    maxUses: 2,
    requiresPlayerPick: false,
  },
  {
    type: 'underdog',
    name: 'Underdog',
    icon: '🎲',
    description: 'If your team scores below the matchday average your points are doubled. Score above average and points are normal.',
    maxUses: 2,
    requiresPlayerPick: false,
  },
]

export const BOOSTER_MAP: Record<BoosterType, BoosterDef> = Object.fromEntries(
  BOOSTERS.map((b) => [b.type, b])
) as Record<BoosterType, BoosterDef>

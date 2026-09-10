export type CorruptionSelection = { id: string; roll: number };
export type CorruptionDraft = { basis: string; source?: string; mods?: CorruptionSelection[]; ranges?: CorruptionSelection[] };
export type CorruptionOptions = {
  canSet: boolean; corrupted: boolean; inherited: boolean; basis: string; reason?: string;
  modsCanSet?: boolean; source?: string; defaultModRoll: number; selected: CorruptionSelection[];
  sources: Array<{ id: string; name: string; maxMods: number; mods: Array<{ id: string; lines: string[]; group: string }> }>;
  ranges: Array<{ id: string; line: string; roll: number; value: number }>;
};

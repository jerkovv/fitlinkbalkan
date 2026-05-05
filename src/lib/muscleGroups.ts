export type MuscleGroupId =
  | "favorites"
  | "grudi"
  | "ledja"
  | "ramena"
  | "biceps"
  | "triceps"
  | "podlaktice"
  | "core"
  | "kvadriceps"
  | "zadnja_loza"
  | "glutei"
  | "listovi"
  | "kardio";

export type MuscleGroupItem = {
  id: MuscleGroupId;
  label: string;
  type: "favorites" | "muscle" | "cardio";
};

export const MUSCLE_GROUPS: MuscleGroupItem[] = [
  { id: "favorites", label: "Omiljeno", type: "favorites" },
  { id: "grudi", label: "Grudi", type: "muscle" },
  { id: "ledja", label: "Leđa", type: "muscle" },
  { id: "ramena", label: "Ramena", type: "muscle" },
  { id: "biceps", label: "Biceps", type: "muscle" },
  { id: "triceps", label: "Triceps", type: "muscle" },
  { id: "podlaktice", label: "Podlaktice", type: "muscle" },
  { id: "core", label: "Core", type: "muscle" },
  { id: "kvadriceps", label: "Kvadriceps", type: "muscle" },
  { id: "zadnja_loza", label: "Zadnja loža", type: "muscle" },
  { id: "glutei", label: "Glutei", type: "muscle" },
  { id: "listovi", label: "Listovi", type: "muscle" },
  { id: "kardio", label: "Kardio", type: "cardio" },
];

export const MUSCLE_LABELS: Record<string, string> = {
  grudi: "Grudi",
  ledja: "Leđa",
  ramena: "Ramena",
  biceps: "Biceps",
  triceps: "Triceps",
  podlaktice: "Podlaktice",
  core: "Core",
  kvadriceps: "Kvadriceps",
  zadnja_loza: "Zadnja loža",
  glutei: "Glutei",
  listovi: "Listovi",
  kardio: "Kardio",
};

export const VACCINE_SCHEDULE = [
  { ageWeeks: 0, vaccine: 'BCG', dose: 1 },
  { ageWeeks: 0, vaccine: 'Hepatitis B', dose: 1 },
  { ageWeeks: 6, vaccine: 'DPT', dose: 1 },
  { ageWeeks: 6, vaccine: 'OPV', dose: 1 },
  { ageWeeks: 10, vaccine: 'DPT', dose: 2 },
  { ageWeeks: 10, vaccine: 'OPV', dose: 2 },
  { ageWeeks: 14, vaccine: 'DPT', dose: 3 },
  { ageWeeks: 14, vaccine: 'OPV', dose: 3 },
  { ageWeeks: 39, vaccine: 'Measles', dose: 1 },
  { ageWeeks: 52, vaccine: 'MMR', dose: 1 },
];

export function getAgeInWeeks(birthdate) {
  if (!birthdate) return 0;
  const ms = Date.now() - new Date(birthdate).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24 * 7)));
}

export function calculateGestationalAge(lmp) {
  if (!lmp) return 0;
  const ms = Date.now() - new Date(lmp).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24 * 7)));
}

export function getEstimatedDueDate(lmp) {
  if (!lmp) return null;
  const d = new Date(lmp);
  d.setDate(d.getDate() + 280);
  return d.toISOString().slice(0, 10);
}

export function getDueVaccines(childBirthdate, immunizations = []) {
  const ageWeeks = getAgeInWeeks(childBirthdate);
  const given = new Set(immunizations.map(i => `${i.vaccineType}:${i.doseNo}`));
  return VACCINE_SCHEDULE.filter(v => ageWeeks >= v.ageWeeks && !given.has(`${v.vaccine}:${v.dose}`));
}
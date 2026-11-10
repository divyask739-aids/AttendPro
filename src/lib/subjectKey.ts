/**
 * Normalized subject identity.
 *
 * A student enrolling in "Data Structures (CS201)" and a staff member
 * teaching "Data Structures / CS201" must land on the same key so the two
 * views connect without duplicating subject records.
 */

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function normalizeSubjectCode(code: string | undefined): string {
  return normalize(code ?? '')
}

export function subjectKey(name: string, code?: string): string {
  const cleanName = normalize(name)
  const cleanCode = normalizeSubjectCode(code)
  return cleanCode ? `${cleanCode}:${cleanName}` : cleanName
}

export function matchesSubjectIdentity(
  candidateName: string,
  candidateCode: string | undefined,
  targetName: string,
  targetCode: string | undefined,
): boolean {
  const candidateCodeKey = normalizeSubjectCode(candidateCode)
  const targetCodeKey = normalizeSubjectCode(targetCode)
  if (candidateCodeKey && targetCodeKey) return candidateCodeKey === targetCodeKey
  return normalize(candidateName) === normalize(targetName)
}

export function matchesSubjectKey(
  candidateName: string,
  candidateCode: string | undefined,
  targetKey: string,
): boolean {
  return subjectKey(candidateName, candidateCode) === targetKey
}

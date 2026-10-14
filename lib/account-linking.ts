/** Verified email alone must never replace an existing Firebase identity. */
export function canLinkLegacyAccount(input: {
  emailVerified: boolean; uid: string; existingUid: string | null;
  googleIdentity?: string; legacyGoogleIdentities: string[];
}): boolean {
  if (!input.emailVerified || (input.existingUid && input.existingUid !== input.uid)) return false;
  if (input.legacyGoogleIdentities.length) {
    return !!input.googleIdentity && input.legacyGoogleIdentities.every(id => id === input.googleIdentity);
  }
  return true;
}

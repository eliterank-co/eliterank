export type NomineePasswordPolicyInput = {
  nomineeEmail: string
  clientEmail?: string | null
  existingAuthUserId?: string | null
  creationNonce?: string | null
  existingUserCreationNonce?: string | null
}

export type NomineePasswordPolicyResult =
  | { allowed: true; email: string; action: 'create' | 'recover_partial' }
  | { allowed: false; status: 403 | 409; error: string }

export function evaluateNomineePasswordPolicy({
  nomineeEmail,
  clientEmail,
  existingAuthUserId,
  creationNonce,
  existingUserCreationNonce,
}: NomineePasswordPolicyInput): NomineePasswordPolicyResult {
  const expectedEmail = nomineeEmail.trim().toLowerCase()
  const suppliedEmail = (clientEmail?.trim() || nomineeEmail.trim()).toLowerCase()

  if (suppliedEmail !== expectedEmail) {
    return {
      allowed: false,
      status: 403,
      error: 'The email address does not match this nomination.',
    }
  }

  if (existingAuthUserId) {
    if (
      creationNonce &&
      existingUserCreationNonce &&
      creationNonce === existingUserCreationNonce
    ) {
      return { allowed: true, email: expectedEmail, action: 'recover_partial' }
    }

    return {
      allowed: false,
      status: 409,
      error: 'An account with this email already exists. Use the secure sign-in link or your existing password.',
    }
  }

  return {
    allowed: true,
    email: expectedEmail,
    action: 'create',
  }
}

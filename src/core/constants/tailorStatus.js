export const TAILOR_VERIFICATION_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
};

export const TAILOR_ACCOUNT_STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DEACTIVATED: 'deactivated',
};

export const TAILOR_PROFICIENCY_LEVEL = {
  BEGINNER: 'beginner',
  INTERMEDIATE: 'intermediate',
  EXPERT: 'expert',
};

export const JOB_STATUS = {
  ASSIGNED: 'assigned',
  MATERIALS_PENDING: 'materials_pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  UNDER_QC: 'under_qc',
  QC_APPROVED: 'qc_approved',
  QC_REJECTED: 'qc_rejected',
};

export const JOB_ASSIGNMENT_TYPE = {
  AUTO: 'auto',
  MANUAL: 'manual',
  REASSIGNED: 'reassigned',
};

export const KYC_DOCUMENT_TYPE = {
  NATIONAL_ID: 'national_id',
  PASSPORT: 'passport',
  DRIVERS_LICENSE: 'drivers_license',
  UTILITY_BILL: 'utility_bill',
};

export const KYC_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
};

export default {
  TAILOR_VERIFICATION_STATUS,
  TAILOR_ACCOUNT_STATUS,
  TAILOR_PROFICIENCY_LEVEL,
  JOB_STATUS,
  JOB_ASSIGNMENT_TYPE,
  KYC_DOCUMENT_TYPE,
  KYC_STATUS,
};

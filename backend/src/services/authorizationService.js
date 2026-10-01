/**
 * Central Server-Side Authorization Service
 *
 * SAFETY COMPLIANCE (OWASP ASVS Level 2 & Phase 4 Standard):
 * 1. Deny by default: Any action not explicitly permitted is blocked with code ACCESS_DENIED.
 * 2. Object-level access control:
 *    - Clinicians can only access charts of patients assigned to them or in their consented care team.
 *    - Patients can only access their own record. Cross-patient access is strictly blocked.
 *    - Separation of duties: Administrators are barred from viewing patient medical charts, SOAP notes,
 *      prescriptions, and vitals.
 *    - Break-glass override allows emergency access for licensed clinicians with mandatory justification.
 *    - Break-glass activations cannot be self-reviewed by the invoking clinician.
 */

class AuthorizationService {
  /**
   * Evaluates authorization for a user against an action and resource within a context.
   *
   * @param {Object} user - Decoded authenticated user session { id, username, role, name, ethereumAddress, patientId }
   * @param {string} action - Action identifier (e.g. "read_patient_chart", "write_encounter", "manage_consent")
   * @param {Object} resource - Target resource descriptor (e.g. { patientId, assignedDoctorIds, ... })
   * @param {Object} context - Environmental context (e.g. { isBreakGlass, justification })
   * @returns {{ allowed: boolean, code?: string, reason: string }}
   */
  authorize(user, action, resource = {}, context = {}) {
    if (!user) {
      return {
        allowed: false,
        code: "UNAUTHENTICATED",
        reason: "Authentication is required to perform this action."
      };
    }

    const role = (user.role || "").toLowerCase();
    const isDoctor = role === "doctor" || role === "clinician" || role === "physician";
    const isNurse = role === "nurse";
    const isClinician = isDoctor || isNurse;
    const isAdmin = role === "admin" || role === "administrator";
    const isComplianceOfficer = role === "compliance_officer" || role === "compliance";
    const isPatient = role === "patient";

    switch (action) {
      // 1. Patient Queue / List Access
      case "read_patient_list": {
        if (isAdmin) {
          // Administrators may view administrative patient registration list without clinical notes
          return { allowed: true, reason: "Administrator demographic queue access granted." };
        }
        if (isClinician) {
          return { allowed: true, reason: "Clinician triage queue access granted." };
        }
        if (isPatient) {
          return { allowed: false, code: "FORBIDDEN", reason: "Patients are not permitted to browse the hospital triage queue." };
        }
        return { allowed: false, code: "FORBIDDEN", reason: "Role does not have permission to view patient lists." };
      }

      // 2. Patient Clinical Chart Access (Object-Level Authorization)
      case "read_patient_chart": {
        // Separation of Duties: Admin is strictly barred from clinical charts
        if (isAdmin) {
          return {
            allowed: false,
            code: "SEPARATION_OF_DUTIES",
            reason: "Separation of Duties: Hospital administrators are prohibited from viewing patient medical charts."
          };
        }

        // Patient Self-Access Isolation
        if (isPatient) {
          const patientIdentifier = (resource.patientId || resource.id || "").toLowerCase();
          const userPatientId = (user.patientId || user.id || "").toLowerCase();
          const userPhn = (user.phn || "").toLowerCase();
          const userNic = (user.nic || "").toLowerCase();

          const isSelf =
            patientIdentifier === userPatientId ||
            (resource.phn && resource.phn.toLowerCase() === userPhn) ||
            (resource.nic && resource.nic.toLowerCase() === userNic);

          if (isSelf) {
            return { allowed: true, reason: "Patient authenticated self-access granted." };
          }
          return {
            allowed: false,
            code: "CROSS_PATIENT_ACCESS_DENIED",
            reason: "Access Denied: Patients are strictly restricted to their own medical chart."
          };
        }

        // Clinician Access (Consent & Care Team Assignment Check)
        if (isClinician) {
          if (context.isBreakGlass === true) {
            return { allowed: true, reason: "Emergency break-glass access override authorized." };
          }

          const docId = (user.id || "").toLowerCase();
          const docAddr = (user.ethereumAddress || "").toLowerCase();
          const docName = (user.name || "").toLowerCase();

          const assignedIds = (resource.assignedDoctorIds || []).map(id => String(id).toLowerCase());
          const assignedAddrs = (resource.assignedDoctorAddresses || []).map(addr => String(addr).toLowerCase());
          const consentedDocs = (resource.consentedDoctors || []).map(cd => String(cd).toLowerCase());

          const isAssigned =
            (docId && assignedIds.includes(docId)) ||
            (docAddr && assignedAddrs.includes(docAddr)) ||
            (docName && consentedDocs.some(cd => cd.includes(docName) || docName.includes(cd)));

          if (isAssigned) {
            return { allowed: true, reason: "Clinician authorized under active care team consent." };
          }

          return {
            allowed: false,
            code: "CONSENT_NOT_GRANTED",
            reason: "Access Denied: You are not assigned to this patient's active care team. Use Emergency Break-Glass if urgent care is required."
          };
        }

        return { allowed: false, code: "FORBIDDEN", reason: "Access denied by default policy." };
      }

      // 3. Clinical SOAP Encounter Notes Authoring
      case "write_encounter": {
        if (isAdmin || isPatient) {
          return {
            allowed: false,
            code: "FORBIDDEN",
            reason: `Access Denied: Role "${user.role}" cannot author clinical encounter notes.`
          };
        }
        if (isClinician) {
          return { allowed: true, reason: "Clinician authorized to author encounter notes." };
        }
        return { allowed: false, code: "FORBIDDEN", reason: "Access denied by default policy." };
      }

      // 4. Prescribing Medications
      case "write_prescription": {
        if (isAdmin || isPatient || isNurse) {
          return {
            allowed: false,
            code: "FORBIDDEN",
            reason: `Access Denied: Role "${user.role}" does not hold prescribing authority.`
          };
        }
        if (isDoctor) {
          return { allowed: true, reason: "Licensed physician authorized to prescribe." };
        }
        return { allowed: false, code: "FORBIDDEN", reason: "Access denied by default policy." };
      }

      // 5. Recording Vital Signs
      case "write_vitals": {
        if (isAdmin || isPatient) {
          return {
            allowed: false,
            code: "FORBIDDEN",
            reason: `Access Denied: Role "${user.role}" cannot record clinical vital signs.`
          };
        }
        if (isClinician) {
          return { allowed: true, reason: "Clinical staff authorized to record vital signs." };
        }
        return { allowed: false, code: "FORBIDDEN", reason: "Access denied by default policy." };
      }

      // 6. Patient Consent Management
      case "manage_consent": {
        if (isPatient) {
          const patientIdentifier = (resource.patientId || resource.id || "").toLowerCase();
          const userPatientId = (user.patientId || user.id || "").toLowerCase();
          if (patientIdentifier === userPatientId) {
            return { allowed: true, reason: "Patient authorized to manage their care team consent." };
          }
          return {
            allowed: false,
            code: "CROSS_PATIENT_ACCESS_DENIED",
            reason: "Access Denied: Patients may only modify consent delegations for their own chart."
          };
        }
        if (isAdmin) {
          return { allowed: false, code: "FORBIDDEN", reason: "Administrators cannot alter patient consent preferences directly." };
        }
        if (isClinician) {
          return { allowed: true, reason: "Attending clinician consent update authorized." };
        }
        return { allowed: false, code: "FORBIDDEN", reason: "Access denied by default policy." };
      }

      // 7. Emergency Break-Glass Activation
      case "activate_break_glass": {
        if (isAdmin || isPatient) {
          return {
            allowed: false,
            code: "FORBIDDEN",
            reason: `Access Denied: Role "${user.role}" cannot activate emergency break-glass protocol.`
          };
        }
        if (isDoctor) {
          return { allowed: true, reason: "Physician authorized to invoke emergency override." };
        }
        return { allowed: false, code: "FORBIDDEN", reason: "Access denied by default policy." };
      }

      // 8. Emergency Break-Glass Compliance Review
      case "review_break_glass": {
        // Anti-Self-Review Rule: Invoking clinician cannot review their own break-glass incident (even if admin/compliance)
        const reviewerId = (user.id || "").toLowerCase();
        const reviewerAddr = (user.ethereumAddress || "").toLowerCase();
        const eventDoctorId = (resource.doctorId || resource.doctor_id || "").toLowerCase();
        const eventDoctorAddr = (resource.doctorAddress || resource.doctor_address || "").toLowerCase();

        if (
          (reviewerId && eventDoctorId && reviewerId === eventDoctorId) ||
          (reviewerAddr && eventDoctorAddr && reviewerAddr === eventDoctorAddr)
        ) {
          return {
            allowed: false,
            code: "CONFLICT_OF_INTEREST",
            reason: "Conflict of Interest: Break-glass activations cannot be self-reviewed by the invoking clinician."
          };
        }

        if (!isAdmin && !isComplianceOfficer) {
          return {
            allowed: false,
            code: "FORBIDDEN",
            reason: "Only hospital administrators or compliance officers can review break-glass events."
          };
        }

        return { allowed: true, reason: "Compliance reviewer authorized." };
      }

      // 9. Administrative Settings, Device and User Management
      case "manage_settings":
      case "manage_users":
      case "manage_devices": {
        if (isAdmin) {
          return { allowed: true, reason: "Administrator privilege verified." };
        }
        return {
          allowed: false,
          code: "FORBIDDEN",
          reason: `Access Denied: Role "${user.role}" is not authorized for system administration.`
        };
      }

      // 10. Audit Ledger Access
      case "read_audit_logs": {
        if (isAdmin || isComplianceOfficer) {
          return { allowed: true, reason: "Compliance audit access granted." };
        }
        return {
          allowed: false,
          code: "FORBIDDEN",
          reason: "Access Denied: Only administrators and compliance officers may view audit trails."
        };
      }

      // Default Fail-Closed
      default:
        return {
          allowed: false,
          code: "UNKNOWN_ACTION",
          reason: `Access Denied: Unrecognized action "${action}".`
        };
    }
  }

  /**
   * Express middleware factory for enforcing authorization on route endpoints.
   */
  middleware(action, resourceExtractor = null) {
    return (req, res, next) => {
      const user = req.user;
      let resource = {};

      if (typeof resourceExtractor === "function") {
        try {
          resource = resourceExtractor(req);
        } catch {
          resource = {};
        }
      } else {
        resource = {
          patientId: req.params.id || req.body.patient_id,
          doctorId: req.body.doctor_address || req.body.doctorId,
          ...req.body
        };
      }

      const decision = this.authorize(user, action, resource, {
        isBreakGlass: req.isBreakGlass === true
      });

      if (!decision.allowed) {
        const statusCode = decision.code === "UNAUTHENTICATED" ? 401 : 403;
        return res.status(statusCode).json({
          error: decision.reason,
          code: decision.code
        });
      }

      next();
    };
  }
}

module.exports = new AuthorizationService();

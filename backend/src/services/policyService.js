const axios = require("axios");
const config = require("../config");

class PolicyService {
  async decide({ consentValid, riskLevel }) {
    const input = {
      consent_valid: Boolean(consentValid),
      risk_level: String(riskLevel).toUpperCase()
    };

    try {
      const response = await axios.post(config.opaUrl, { input }, { timeout: 2000 });
      if (response.data && response.data.result) {
        const res = response.data.result;
        return typeof res === "string" ? res : res.decision || "BLOCK";
      }
    } catch (err) {
      // Local fallback matching access_policy.rego exactly
    }

    return this._localRegoFallback(input);
  }

  async evaluateAccess(riskLevel, consentValid) {
    return this.decide({ consentValid, riskLevel });
  }

  _localRegoFallback(input) {
    if (input.consent_valid === false) {
      return "BLOCK";
    }
    if (input.risk_level === "HIGH") {
      return "BLOCK";
    }
    if (input.consent_valid === true && input.risk_level === "LOW") {
      return "ALLOW";
    }
    if (input.consent_valid === true && input.risk_level === "MEDIUM") {
      return "MFA_REQUIRED";
    }
    return "BLOCK";
  }
}

module.exports = new PolicyService();

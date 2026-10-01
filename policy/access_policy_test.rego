package medguard.access_test

import rego.v1
import data.medguard.access

test_allow_when_consent_valid_and_low_risk if {
    access.decision == "ALLOW" with input as {
        "consent_valid": true,
        "risk_level": "LOW"
    }
}

test_mfa_required_when_consent_valid_and_medium_risk if {
    access.decision == "MFA_REQUIRED" with input as {
        "consent_valid": true,
        "risk_level": "MEDIUM"
    }
}

test_block_when_consent_invalid_overriding_low_risk if {
    access.decision == "BLOCK" with input as {
        "consent_valid": false,
        "risk_level": "LOW"
    }
}

test_block_when_consent_invalid_overriding_medium_risk if {
    access.decision == "BLOCK" with input as {
        "consent_valid": false,
        "risk_level": "MEDIUM"
    }
}

test_block_when_high_risk_even_if_consent_valid if {
    access.decision == "BLOCK" with input as {
        "consent_valid": true,
        "risk_level": "HIGH"
    }
}

test_block_when_both_consent_invalid_and_high_risk if {
    access.decision == "BLOCK" with input as {
        "consent_valid": false,
        "risk_level": "HIGH"
    }
}

test_default_block_on_empty_input if {
    access.decision == "BLOCK" with input as {}
}

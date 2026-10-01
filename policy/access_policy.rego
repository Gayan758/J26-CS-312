package medguard.access

import rego.v1

default decision := "BLOCK"

decision := "ALLOW" if {
    input.consent_valid == true
    input.risk_level == "LOW"
}

decision := "MFA_REQUIRED" if {
    input.consent_valid == true
    input.risk_level == "MEDIUM"
}

decision := "BLOCK" if {
    input.consent_valid == false
}

decision := "BLOCK" if {
    input.risk_level == "HIGH"
}

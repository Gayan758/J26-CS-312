// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IConsentRegistry
 * @dev Interface for the Dynamic Consent Management (Proxy Re-Encryption) module.
 * Exposes consent checking and scoped decryption-key release for authorized access decisions.
 */
interface IConsentRegistry {
    /**
     * @dev Emitted whenever a decryption key is released following an authorized access or emergency decision.
     */
    event DecryptionKeyReleased(
        address indexed doctor,
        bytes32 indexed patientId,
        bytes32 indexed accessDecisionId,
        bytes key
    );

    /**
     * @dev Checks if active patient consent exists for the specified doctor.
     */
    function hasValidConsent(address doctor, bytes32 patientId) external view returns (bool);

    /**
     * @dev Releases the patient decryption key scoped to a specific access decision.
     * Only callable by the authorized backend or Break-Glass controller after an ALLOW decision.
     */
    function releaseDecryptionKey(
        address doctor,
        bytes32 patientId,
        bytes32 accessDecisionId
    ) external returns (bytes memory);
}

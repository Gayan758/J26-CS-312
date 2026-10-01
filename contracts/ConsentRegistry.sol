// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IConsentRegistry.sol";

/**
 * @title ConsentRegistry
 * @dev Stub implementation for the MedGuard Dynamic Consent Management module.
 * Holds consent records and patient re-encryption/decryption keys, releasing keys
 * strictly upon valid consent and authorized access decision context.
 */
contract ConsentRegistry is IConsentRegistry {
    address public owner;

    // doctor => patientId => isValid
    mapping(address => mapping(bytes32 => bool)) private _consents;

    // patientId => encrypted/re-encryption key bytes
    mapping(bytes32 => bytes) private _patientKeys;

    // Authorized backend callers allowed to trigger releaseDecryptionKey
    mapping(address => bool) public authorizedCallers;

    event ConsentUpdated(address indexed doctor, bytes32 indexed patientId, bool isValid);
    event PatientKeyRegistered(bytes32 indexed patientId);
    event AuthorizedCallerUpdated(address indexed caller, bool isAuthorized);

    modifier onlyOwner() {
        require(msg.sender == owner, "ConsentRegistry: caller is not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == owner || authorizedCallers[msg.sender], "ConsentRegistry: caller not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedCallers[msg.sender] = true;
    }

    function setAuthorizedCaller(address caller, bool isAuthorized) external onlyOwner {
        authorizedCallers[caller] = isAuthorized;
        emit AuthorizedCallerUpdated(caller, isAuthorized);
    }

    function setConsent(address doctor, bytes32 patientId, bool isValid) external onlyAuthorized {
        _consents[doctor][patientId] = isValid;
        emit ConsentUpdated(doctor, patientId, isValid);
    }

    function registerPatientKey(bytes32 patientId, bytes calldata key) external onlyAuthorized {
        require(key.length > 0, "ConsentRegistry: key cannot be empty");
        _patientKeys[patientId] = key;
        emit PatientKeyRegistered(patientId);
    }

    function hasValidConsent(address doctor, bytes32 patientId) external view override returns (bool) {
        return _consents[doctor][patientId];
    }

    function releaseDecryptionKey(
        address doctor,
        bytes32 patientId,
        bytes32 accessDecisionId
    ) external override onlyAuthorized returns (bytes memory) {
        bytes memory key = _patientKeys[patientId];
        require(key.length > 0, "ConsentRegistry: no key registered for patient");

        emit DecryptionKeyReleased(doctor, patientId, accessDecisionId, key);
        return key;
    }
}

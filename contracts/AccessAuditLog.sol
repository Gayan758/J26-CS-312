// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AccessAuditLog
 * @dev Append-only tamper-evident audit ledger for MedGuard access control decisions.
 * Every normal access evaluation and emergency break-glass event is permanently recorded here.
 * Never stores medical records, decryption keys, or unhashed PII.
 */
contract AccessAuditLog {
    struct AccessRecord {
        bytes32 accessDecisionId;
        address requester;
        bytes32 patientIdHash;
        uint256 timestamp;
        string riskLevel;      // "LOW", "MEDIUM", "HIGH"
        string decision;       // "ALLOW", "MFA_REQUIRED", "BLOCK", "BREAK_GLASS"
        bool isBreakGlass;
    }

    address public owner;
    mapping(address => bool) public authorizedRecorders;

    AccessRecord[] private _records;

    event AccessLogged(
        bytes32 indexed accessDecisionId,
        address indexed requester,
        bytes32 indexed patientIdHash,
        uint256 timestamp,
        string riskLevel,
        string decision,
        bool isBreakGlass
    );

    event AuthorizedRecorderUpdated(address indexed recorder, bool isAuthorized);

    modifier onlyOwner() {
        require(msg.sender == owner, "AccessAuditLog: caller is not owner");
        _;
    }

    modifier onlyAuthorized() {
        require(msg.sender == owner || authorizedRecorders[msg.sender], "AccessAuditLog: caller not authorized");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedRecorders[msg.sender] = true;
    }

    function setAuthorizedRecorder(address recorder, bool isAuthorized) external onlyOwner {
        authorizedRecorders[recorder] = isAuthorized;
        emit AuthorizedRecorderUpdated(recorder, isAuthorized);
    }

    /**
     * @dev Appends an immutable access decision record to the blockchain.
     * No update or deletion capabilities exist in this contract.
     */
    function logAccess(
        bytes32 accessDecisionId,
        address requester,
        bytes32 patientIdHash,
        string calldata riskLevel,
        string calldata decision,
        bool isBreakGlass
    ) external onlyAuthorized returns (uint256 recordIndex) {
        AccessRecord memory newRecord = AccessRecord({
            accessDecisionId: accessDecisionId,
            requester: requester,
            patientIdHash: patientIdHash,
            timestamp: block.timestamp,
            riskLevel: riskLevel,
            decision: decision,
            isBreakGlass: isBreakGlass
        });

        _records.push(newRecord);
        recordIndex = _records.length - 1;

        emit AccessLogged(
            accessDecisionId,
            requester,
            patientIdHash,
            block.timestamp,
            riskLevel,
            decision,
            isBreakGlass
        );
    }

    function getRecordCount() external view returns (uint256) {
        return _records.length;
    }

    function getRecord(uint256 index) external view returns (
        bytes32 accessDecisionId,
        address requester,
        bytes32 patientIdHash,
        uint256 timestamp,
        string memory riskLevel,
        string memory decision,
        bool isBreakGlass
    ) {
        require(index < _records.length, "AccessAuditLog: index out of bounds");
        AccessRecord memory r = _records[index];
        return (
            r.accessDecisionId,
            r.requester,
            r.patientIdHash,
            r.timestamp,
            r.riskLevel,
            r.decision,
            r.isBreakGlass
        );
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title BreakGlassRegistry
 * @dev Manages time-boxed emergency override tokens for life-threatening medical emergencies.
 * Implements the Red Alert Protocol (RAP) without bypassing cryptographic accountability.
 */
contract BreakGlassRegistry {
    struct BreakGlassToken {
        bytes32 tokenId;
        address doctor;
        bytes32 patientId;
        uint256 createdAt;
        uint256 expiresAt;
        string justification;
        bool revoked;
    }

    address public owner;
    uint256 public maxDuration; // Configurable max duration in seconds (e.g. 1800 to 3600)
    uint256 public defaultDuration;

    mapping(bytes32 => BreakGlassToken) private _tokens;
    bytes32[] private _tokenIds;

    event BreakGlassActivated(
        address indexed doctor,
        bytes32 indexed patientId,
        bytes32 indexed tokenId,
        uint256 expiresAt,
        string justification
    );

    event BreakGlassRevoked(
        bytes32 indexed tokenId,
        address indexed doctor,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "BreakGlassRegistry: caller is not owner");
        _;
    }

    /**
     * @param _maxDuration Maximum duration in seconds (e.g. 3600 for 60 min). Must be >= 1800 (30 min).
     * @param _defaultDuration Default duration in seconds (e.g. 1800 for 30 min).
     */
    constructor(uint256 _maxDuration, uint256 _defaultDuration) {
        require(_maxDuration >= 1800, "BreakGlassRegistry: maxDuration must be at least 30 min (1800s)");
        require(_defaultDuration > 0 && _defaultDuration <= _maxDuration, "BreakGlassRegistry: invalid defaultDuration");
        owner = msg.sender;
        maxDuration = _maxDuration;
        defaultDuration = _defaultDuration;
    }

    /**
     * @dev Activates an emergency override for a patient with mandatory clinical justification.
     * Mints a unique time-boxed token ID with a strict expiration time.
     */
    function activateBreakGlass(
        bytes32 patientId,
        string calldata justification
    ) external returns (bytes32 tokenId) {
        require(bytes(justification).length >= 10, "BreakGlassRegistry: justification must be at least 10 chars");
        require(patientId != bytes32(0), "BreakGlassRegistry: invalid patientId");

        uint256 expiresAt = block.timestamp + defaultDuration;
        tokenId = keccak256(
            abi.encodePacked(
                msg.sender,
                patientId,
                block.timestamp,
                _tokenIds.length,
                justification
            )
        );

        _tokens[tokenId] = BreakGlassToken({
            tokenId: tokenId,
            doctor: msg.sender,
            patientId: patientId,
            createdAt: block.timestamp,
            expiresAt: expiresAt,
            justification: justification,
            revoked: false
        });

        _tokenIds.push(tokenId);

        emit BreakGlassActivated(
            msg.sender,
            patientId,
            tokenId,
            expiresAt,
            justification
        );
    }

    /**
     * @dev Checks if a token exists, is not revoked, and has not passed its expiration time.
     * Auto-invalidates expired tokens at read time without requiring cron triggers.
     */
    function isTokenValid(bytes32 tokenId) external view returns (bool) {
        BreakGlassToken memory token = _tokens[tokenId];
        if (token.tokenId == bytes32(0)) {
            return false;
        }
        if (token.revoked) {
            return false;
        }
        if (block.timestamp > token.expiresAt) {
            return false;
        }
        return true;
    }

    /**
     * @dev Explicitly revokes an active emergency session early once treatment is concluded.
     */
    function revokeToken(bytes32 tokenId) external {
        BreakGlassToken storage token = _tokens[tokenId];
        require(token.tokenId != bytes32(0), "BreakGlassRegistry: token not found");
        require(msg.sender == token.doctor || msg.sender == owner, "BreakGlassRegistry: unauthorized to revoke");
        require(!token.revoked, "BreakGlassRegistry: token already revoked");

        token.revoked = true;
        emit BreakGlassRevoked(tokenId, msg.sender, block.timestamp);
    }

    function getToken(bytes32 tokenId) external view returns (
        bytes32 id,
        address doctor,
        bytes32 patientId,
        uint256 createdAt,
        uint256 expiresAt,
        string memory justification,
        bool revoked
    ) {
        BreakGlassToken memory t = _tokens[tokenId];
        require(t.tokenId != bytes32(0), "BreakGlassRegistry: token not found");
        return (
            t.tokenId,
            t.doctor,
            t.patientId,
            t.createdAt,
            t.expiresAt,
            t.justification,
            t.revoked
        );
    }

    function getTokenCount() external view returns (uint256) {
        return _tokenIds.length;
    }
}

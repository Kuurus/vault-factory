// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/utils/Strings.sol";
import "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2.sol";
import "@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroReceiver.sol";

contract EndpointV2Mock is ILayerZeroEndpointV2 {
    uint32 public immutable eid;
    mapping(address => address) public destLzEndpoint;
    mapping(address => bytes[]) private messageStore;
    mapping(address => uint64) private nonces;

    constructor(uint32 _eid) {
        eid = _eid;
    }

    function setDestLzEndpoint(address _destination, address _endpoint) external {
        destLzEndpoint[_destination] = _endpoint;
    }

    function send(
        MessagingParams calldata _params,
        address _refundAddress
    ) external payable returns (MessagingReceipt memory receipt) {
        uint64 nonce = ++nonces[msg.sender];
        address receiver = _params.receiver.bytes32ToAddress();
        address dstEndpoint = destLzEndpoint[receiver];

        if (dstEndpoint != address(0)) {
            // Store message in source endpoint
            messageStore[msg.sender].push(_params.message);

            // Create origin for message delivery
            Origin memory origin = Origin({ srcEid: eid, sender: msg.sender.addressToBytes32(), nonce: nonce });

            // Deliver message directly to receiver
            ILayerZeroReceiver(receiver).lzReceive(origin, bytes32(nonce), _params.message, address(0), "");
        }

        receipt.guid = bytes32(nonce);
        receipt.nonce = nonce;
        receipt.fee = MessagingFee(0, msg.value);
        return receipt;
    }

    function getMessagesBySrcAddress(address _srcAddress) external view returns (bytes[] memory) {
        return messageStore[_srcAddress];
    }

    function lzReceive(
        Origin calldata _origin,
        address _receiver,
        bytes32 _guid,
        bytes calldata _message,
        bytes calldata _extraData
    ) external payable {
        address sender = _origin.sender.bytes32ToAddress();

        // Store message in destination endpoint
        messageStore[sender].push(_message);

        // Process message on receiver
        ILayerZeroReceiver(_receiver).lzReceive(_origin, _guid, _message, address(0), _extraData);
    }

    function clearMessages(address _srcAddress) external {
        delete messageStore[_srcAddress];
    }

    // Required interface implementations
    function quote(MessagingParams calldata, address) external pure returns (MessagingFee memory) {
        return MessagingFee(0, 0);
    }

    function lzToken() external pure returns (address) {
        return address(0);
    }

    // Complete interface implementations
    function defaultReceiveLibrary(uint32) external pure returns (address) {
        return address(0);
    }

    function defaultReceiveLibraryTimeout(uint32) external pure returns (address, uint256) {
        return (address(0), 0);
    }

    function defaultSendLibrary(uint32) external pure returns (address) {
        return address(0);
    }

    function isRegisteredLibrary(address) external pure returns (bool) {
        return false;
    }

    function isSupportedEid(uint32) external pure returns (bool) {
        return true;
    }

    function nextGuid(address, uint32, bytes32) external pure returns (bytes32) {
        return bytes32(0);
    }

    function nativeToken() external pure returns (address) {
        return address(0);
    }

    function burn(address, uint32, bytes32, uint64, bytes32) external {}

    function clear(address, Origin calldata, bytes32, bytes calldata) external {}

    function executable(Origin calldata, address) external pure returns (ExecutionState) {
        return ExecutionState.NotExecutable;
    }

    function getConfig(address, address, uint32, uint32) external pure returns (bytes memory) {
        return "";
    }

    function getReceiveLibrary(address, uint32) external pure returns (address, bool) {
        return (address(0), false);
    }

    function getRegisteredLibraries() external pure returns (address[] memory) {
        return new address[](0);
    }

    function getSendLibrary(address, uint32) external pure returns (address) {
        return address(0);
    }

    function inboundNonce(address, uint32, bytes32) external pure returns (uint64) {
        return 0;
    }

    function isDefaultSendLibrary(address, uint32) external pure returns (bool) {
        return false;
    }

    function verify(Origin calldata, address, bytes32) external {}
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title MusheeOracle — EVM attested feed verifier prototype
 * @notice Verifies that two separate operator keys assigned to distinct
 *         underlying-source categories signed the SAME reference-price report.
 * @dev    Not audited. No staking, decentralised governance, price-discovery,
 *         exchange-origin proof or permissionless node registration.
 *
 * Report hash MUST be signed with EIP-191 personal_sign of the 32-byte digest.
 * The EVM uses secp256k1; offchain Ed25519 publisher signatures are a distinct
 * scheme and CANNOT be reused in this contract.
 */
contract MusheeOracle {
    struct PriceFeed {
        uint192 priceE8;
        uint64 observedAt;
        uint64 sequence;
    }
    error NotOwner();
    error InvalidOwner();
    error InvalidPublisher();
    error InvalidReport();
    error InvalidSignature();
    error InsufficientQuorum();
    error StalePrice();
    error Replay();

    uint256 private constant SECP256K1_HALF_N =
        0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;
    bytes32 public constant REPORT_DOMAIN = keccak256("mushee-mm/evm-price-report/v1");
    uint64 public constant MAX_AGE_SECONDS = 30;
    uint64 public constant CLOCK_TOLERANCE_SECONDS = 5;
    uint192 public constant MAX_PRICE_E8 = 1e26;

    address public owner;
    mapping(address => uint8) public publisherSource;
    mapping(bytes32 => PriceFeed) private feeds;

    event OwnershipTransferred(address indexed previousOwner,address indexed nextOwner);
    event PublisherUpdated(address indexed publisher,uint8 source);
    event PriceUpdated(bytes32 indexed symbol,uint192 priceE8,uint64 observedAt,uint64 sequence);

    constructor(address initialOwner) {
        if(initialOwner==address(0))revert InvalidOwner();
        owner=initialOwner;
        emit OwnershipTransferred(address(0),initialOwner);
    }

    modifier onlyOwner() {
        if(msg.sender!=owner)revert NotOwner();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if(newOwner==address(0))revert InvalidOwner();
        emit OwnershipTransferred(owner,newOwner);
        owner=newOwner;
    }

    /** Source values are 1 (Coinbase), 2 (Kraken), or 0 to revoke. */
    function setPublisher(address signer,uint8 source) external onlyOwner {
        if(signer==address(0) || source>2)revert InvalidPublisher();
        publisherSource[signer]=source;
        emit PublisherUpdated(signer,source);
    }

    function reportHash(
        bytes32 symbol,uint192 priceE8,uint64 observedAt,uint64 sequence
    ) public view returns(bytes32) {
        return keccak256(abi.encode(
            REPORT_DOMAIN,block.chainid,address(this),symbol,priceE8,observedAt,sequence
        ));
    }

    /**
     * Requires exactly two independent source categories, each signing the
     * identical data. Does not accept consensus by duplicate operator keys.
     */
    function submit(
        bytes32 symbol,uint192 priceE8,uint64 observedAt,uint64 sequence,
        bytes[] calldata signatures
    ) external {
        if(symbol==bytes32(0) || priceE8==0 || priceE8>MAX_PRICE_E8 ||
           signatures.length<2 || signatures.length>10)revert InvalidReport();
        if(uint256(observedAt)>block.timestamp+CLOCK_TOLERANCE_SECONDS ||
           block.timestamp>uint256(observedAt)+MAX_AGE_SECONDS)revert StalePrice();
        if(sequence<=feeds[symbol].sequence)revert Replay();

        bytes32 payload=reportHash(symbol,priceE8,observedAt,sequence);
        bytes32 digest=keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",payload
        ));
        uint8 sourceMask=0;
        for(uint256 i=0;i<signatures.length;i++) {
            address signer=_recover(digest,signatures[i]);
            uint8 source=publisherSource[signer];
            if(source==0)revert InvalidSignature();
            uint8 flag=uint8(1 << (source-1));
            if((sourceMask & flag)!=0)revert InvalidSignature();
            sourceMask|=flag;
        }
        if(sourceMask!=3)revert InsufficientQuorum();
        feeds[symbol]=PriceFeed({priceE8:priceE8,observedAt:observedAt,sequence:sequence});
        emit PriceUpdated(symbol,priceE8,observedAt,sequence);
    }

    function read(bytes32 symbol) external view returns(
        uint192 priceE8,uint64 observedAt,uint64 sequence,bool fresh
    ) {
        PriceFeed memory f=feeds[symbol];
        return(f.priceE8,f.observedAt,f.sequence,
            f.observedAt>0 && block.timestamp<=uint256(f.observedAt)+MAX_AGE_SECONDS);
    }

    function _recover(bytes32 digest,bytes calldata signature)
        private pure returns(address signer)
    {
        if(signature.length!=65)revert InvalidSignature();
        bytes32 r;bytes32 s;uint8 v;
        assembly {
            r:=calldataload(signature.offset)
            s:=calldataload(add(signature.offset,32))
            v:=byte(0,calldataload(add(signature.offset,64)))
        }
        if(uint256(s)>SECP256K1_HALF_N || uint256(s)==0 || (v!=27 && v!=28)) {
            revert InvalidSignature();
        }
        signer=ecrecover(digest,v,r,s);
        if(signer==address(0))revert InvalidSignature();
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title EnbMiniApp
 * @dev Smart contract for ENB token distribution with membership levels and unlimited check-ins
 * @dev Restricted to only allow interaction from a specific authorized address
 */
contract EnbMiniApp is ReentrancyGuard, Pausable {
    IERC20 public immutable enbToken;
    address public immutable authorizedAddress;
    address public immutable deployer;
    
    // Membership levels
    enum MembershipLevel { Based, SuperBased, Legendary }
    
    // User account structure
    struct UserAccount {
        bool exists;
        MembershipLevel membershipLevel;
        uint256 lastCheckinTime;
        uint256 totalCheckins;
        uint256 totalYieldClaimed;
        uint256 accountCreatedAt;
    }
    
    // Membership level configuration
    struct LevelConfig {
        uint256 checkinYield;
        uint256 upgradeRequirement;
        string name;
    }
    
    // State variables
    mapping(address => UserAccount) public userAccounts;
    mapping(MembershipLevel => LevelConfig) public levelConfigs;
    
    // Events
    event AccountCreated(address indexed user, uint256 timestamp);
    event CheckinCompleted(address indexed user, uint256 yieldAmount, uint256 timestamp);
    event MembershipUpgraded(address indexed user, MembershipLevel newLevel, uint256 timestamp);
    event YieldDistributed(address indexed user, uint256 amount, string transactionType);
    event ContractPaused(uint256 timestamp);
    event ContractUnpaused(uint256 timestamp);
    
    // Errors
    error UnauthorizedAccess();
    error AccountAlreadyExists();
    error AccountDoesNotExist();
    error InsufficientTokensForUpgrade();
    error InvalidMembershipLevel();
    error InsufficientContractBalance();
    error TransferFailed();
    error DeployerCannotWithdraw();
    
    // Modifier to restrict access to authorized address only
    modifier onlyAuthorized() {
        if (msg.sender != authorizedAddress) {
            revert UnauthorizedAccess();
        }
        _;
    }
    
    // Modifier to ensure deployer cannot withdraw tokens
    modifier notDeployer() {
        if (msg.sender == deployer) {
            revert DeployerCannotWithdraw();
        }
        _;
    }
    
    /**
     * @dev Constructor
     * @param _enbTokenAddress Address of the ENB token contract
     * @param _authorizedAddress The only address allowed to interact with this contract
     */
    constructor(address _enbTokenAddress, address _authorizedAddress) {
        require(_enbTokenAddress != address(0), "Invalid token address");
        require(_authorizedAddress != address(0), "Invalid authorized address");
        require(_authorizedAddress != msg.sender, "Authorized address cannot be deployer");
        
        enbToken = IERC20(_enbTokenAddress);
        authorizedAddress = _authorizedAddress;
        deployer = msg.sender;
        
        // Initialize membership level configurations
        levelConfigs[MembershipLevel.Based] = LevelConfig({
            checkinYield: 5 * 10**18, // 5 ENB tokens (assuming 18 decimals)
            upgradeRequirement: 0,
            name: "Based"
        });
        
        levelConfigs[MembershipLevel.SuperBased] = LevelConfig({
            checkinYield: 10 * 10**18, // 10 ENB tokens
            upgradeRequirement: 5000 * 10**18, // 5000 ENB tokens
            name: "Super Based"
        });
        
        levelConfigs[MembershipLevel.Legendary] = LevelConfig({
            checkinYield: 15 * 10**18, // 15 ENB tokens
            upgradeRequirement: 15000 * 10**18, // 15000 ENB tokens
            name: "Legendary"
        });
    }
    
    /**
     * @dev Create a new user account
     * @param user The wallet address to create account for
     */
    function createAccount(address user) external nonReentrant whenNotPaused onlyAuthorized {
        if (userAccounts[user].exists) {
            revert AccountAlreadyExists();
        }
        
        userAccounts[user] = UserAccount({
            exists: true,
            membershipLevel: MembershipLevel.Based,
            lastCheckinTime: 0,
            totalCheckins: 0,
            totalYieldClaimed: 0,
            accountCreatedAt: block.timestamp
        });
        
        emit AccountCreated(user, block.timestamp);
    }
    
    /**
     * @dev Process check-in and distribute yield (no time restrictions)
     * @param user The user address to process check-in for
     */
    function checkin(address user) external nonReentrant whenNotPaused onlyAuthorized notDeployer {
        UserAccount storage account = userAccounts[user];
        
        if (!account.exists) {
            revert AccountDoesNotExist();
        }
        
        // Calculate yield based on membership level
        uint256 yieldAmount = levelConfigs[account.membershipLevel].checkinYield;
        
        // Check if contract has sufficient balance
        if (enbToken.balanceOf(address(this)) < yieldAmount) {
            revert InsufficientContractBalance();
        }
        
        // Update account
        account.lastCheckinTime = block.timestamp;
        account.totalCheckins++;
        account.totalYieldClaimed += yieldAmount;
        
        // Distribute tokens
        bool success = enbToken.transfer(user, yieldAmount);
        if (!success) {
            revert TransferFailed();
        }
        
        emit CheckinCompleted(user, yieldAmount, block.timestamp);
        emit YieldDistributed(user, yieldAmount, "checkin_yield");
    }
    
    /**
     * @dev Upgrade user membership level
     * @param user The user address to upgrade
     * @param targetLevel The target membership level
     */
    function upgradeMembership(address user, MembershipLevel targetLevel) external nonReentrant whenNotPaused onlyAuthorized {
        UserAccount storage account = userAccounts[user];
        
        if (!account.exists) {
            revert AccountDoesNotExist();
        }
        
        if (targetLevel <= account.membershipLevel) {
            revert InvalidMembershipLevel();
        }
        
        uint256 requiredTokens = levelConfigs[targetLevel].upgradeRequirement;
        uint256 userBalance = enbToken.balanceOf(user);
        
        if (userBalance < requiredTokens) {
            revert InsufficientTokensForUpgrade();
        }
        
        // Transfer required tokens from user to contract (burn mechanism)
        bool success = enbToken.transferFrom(user, address(this), requiredTokens);
        if (!success) {
            revert TransferFailed();
        }
        
        // Update membership level
        account.membershipLevel = targetLevel;
        
        emit MembershipUpgraded(user, targetLevel, block.timestamp);
    }
    
    /**
     * @dev Get user profile information
     * @param user The wallet address to query
     * @return exists Whether account exists
     * @return membershipLevel Current membership level
     * @return lastCheckinTime Timestamp of last check-in
     * @return totalCheckins Total number of check-ins
     * @return totalYieldClaimed Total yield claimed
     * @return accountCreatedAt Account creation timestamp
     */
    function getUserProfile(address user) external view returns (
        bool exists,
        MembershipLevel membershipLevel,
        uint256 lastCheckinTime,
        uint256 totalCheckins,
        uint256 totalYieldClaimed,
        uint256 accountCreatedAt
    ) {
        UserAccount storage account = userAccounts[user];
        return (
            account.exists,
            account.membershipLevel,
            account.lastCheckinTime,
            account.totalCheckins,
            account.totalYieldClaimed,
            account.accountCreatedAt
        );
    }
    
    /**
     * @dev Calculate yield per check-in for a membership level
     * @param level The membership level
     * @return The yield amount per check-in
     */
    function calculateCheckinYield(MembershipLevel level) external view returns (uint256) {
        return levelConfigs[level].checkinYield;
    }
    
    /**
     * @dev Get membership requirements for upgrade
     * @param currentLevel Current membership level
     * @return nextLevel Next available level
     * @return requiredTokens Tokens required for upgrade
     * @return canUpgrade Whether upgrade is possible
     */
    function getMembershipRequirements(MembershipLevel currentLevel) external view returns (
        MembershipLevel nextLevel,
        uint256 requiredTokens,
        bool canUpgrade
    ) {
        if (currentLevel == MembershipLevel.Based) {
            return (MembershipLevel.SuperBased, levelConfigs[MembershipLevel.SuperBased].upgradeRequirement, true);
        } else if (currentLevel == MembershipLevel.SuperBased) {
            return (MembershipLevel.Legendary, levelConfigs[MembershipLevel.Legendary].upgradeRequirement, true);
        } else {
            return (MembershipLevel.Legendary, 0, false); // Already at max level
        }
    }
    
    /**
     * @dev Check if wallet has an associated account
     * @param user The wallet address to check
     * @return Whether account exists
     */
    function checkWalletAccountStatus(address user) external view returns (bool) {
        return userAccounts[user].exists;
    }
    
    /**
     * @dev Get the timestamp of user's last check-in
     * @param user The wallet address
     * @return The timestamp of last check-in
     */
    function getLastCheckinTime(address user) external view returns (uint256) {
        return userAccounts[user].lastCheckinTime;
    }
    
    /**
     * @dev Get the total number of check-ins for a user
     * @param user The wallet address
     * @return The total number of check-ins
     */
    function getTotalCheckins(address user) external view returns (uint256) {
        return userAccounts[user].totalCheckins;
    }
    
    /**
     * @dev Distribute bonus tokens (only authorized address)
     * @param recipient The recipient address
     * @param amount The amount to distribute
     * @param transactionType The type of distribution
     */
    function distributeTokens(
        address recipient,
        uint256 amount,
        string calldata transactionType
    ) external nonReentrant onlyAuthorized notDeployer {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Invalid amount");
        
        if (enbToken.balanceOf(address(this)) < amount) {
            revert InsufficientContractBalance();
        }
        
        bool success = enbToken.transfer(recipient, amount);
        if (!success) {
            revert TransferFailed();
        }
        
        emit YieldDistributed(recipient, amount, transactionType);
    }
    
    /**
     * @dev Pause the contract (only authorized address)
     */
    function pause() external onlyAuthorized {
        _pause();
        emit ContractPaused(block.timestamp);
    }
    
    /**
     * @dev Unpause the contract (only authorized address)
     */
    function unpause() external onlyAuthorized {
        _unpause();
        emit ContractUnpaused(block.timestamp);
    }
    
    /**
     * @dev Get contract's ENB token balance
     * @return The contract's token balance
     */
    function getContractBalance() external view returns (uint256) {
        return enbToken.balanceOf(address(this));
    }
    
    /**
     * @dev Get ENB token address
     * @return The ENB token contract address
     */
    function getEnbTokenAddress() external view returns (address) {
        return address(enbToken);
    }
    
    /**
     * @dev Get the authorized address
     * @return The authorized address
     */
    function getAuthorizedAddress() external view returns (address) {
        return authorizedAddress;
    }
    
    /**
     * @dev Get the deployer address
     * @return The deployer address
     */
    function getDeployerAddress() external view returns (address) {
        return deployer;
    }
}
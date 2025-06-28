// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract EnbMiniApp is ReentrancyGuard, Pausable, Ownable {
    IERC20 public immutable enbToken;

    enum MembershipLevel { Based, SuperBased, Legendary }

    struct UserAccount {
        bool exists;
        MembershipLevel membershipLevel;
        uint256 lastDailyClaimTime;
        uint256 totalDailyClaims;
        uint256 totalYieldClaimed;
        uint256 accountCreatedAt;
    }

    struct LevelConfig {
        uint256 dailyClaimYield;
        uint256 upgradeRequirement;
        string name;
    }

    mapping(address => UserAccount) public userAccounts;
    mapping(MembershipLevel => LevelConfig) public levelConfigs;

    uint256 public constant DAILY_CLAIM_COOLDOWN = 24 hours;

    event AccountCreated(address indexed user, uint256 timestamp);
    event DailyClaimCompleted(address indexed user, uint256 yieldAmount, uint256 timestamp);
    event MembershipUpgraded(address indexed user, MembershipLevel newLevel, uint256 timestamp);
    event YieldDistributed(address indexed user, uint256 amount, string transactionType);
    event ContractPaused(uint256 timestamp);
    event ContractUnpaused(uint256 timestamp);
    event TokensWithdrawn(address indexed owner, uint256 amount, uint256 timestamp);

    error AccountAlreadyExists();
    error AccountDoesNotExist();
    error InvalidMembershipLevel();
    error InsufficientTokensForUpgrade();
    error InsufficientContractBalance();
    error TransferFailed();
    error OnlySelfAllowed();
    error DailyClaimOnCooldown();
    error InvalidAmount();
    error InvalidRecipient();

    modifier onlySelf(address user) {
        if (msg.sender != user) {
            revert OnlySelfAllowed();
        }
        _;
    }

    constructor(address _enbTokenAddress) Ownable(msg.sender) {
        require(_enbTokenAddress != address(0), "Invalid token address");

        enbToken = IERC20(_enbTokenAddress);

        levelConfigs[MembershipLevel.Based] = LevelConfig({
            dailyClaimYield: 5 * 10**18,
            upgradeRequirement: 0,
            name: "Based"
        });

        levelConfigs[MembershipLevel.SuperBased] = LevelConfig({
            dailyClaimYield: 10 * 10**18,
            upgradeRequirement: 5000 * 10**18,
            name: "Super Based"
        });

        levelConfigs[MembershipLevel.Legendary] = LevelConfig({
            dailyClaimYield: 15 * 10**18,
            upgradeRequirement: 15000 * 10**18,
            name: "Legendary"
        });
    }

    function createAccount(address user) external nonReentrant whenNotPaused onlySelf(user) {
        if (userAccounts[user].exists) {
            revert AccountAlreadyExists();
        }

        userAccounts[user] = UserAccount({
            exists: true,
            membershipLevel: MembershipLevel.Based,
            lastDailyClaimTime: 0,
            totalDailyClaims: 0,
            totalYieldClaimed: 0,
            accountCreatedAt: block.timestamp
        });

        emit AccountCreated(user, block.timestamp);
    }

    function dailyClaim(address user) external nonReentrant whenNotPaused onlySelf(user) {
        UserAccount storage account = userAccounts[user];

        if (!account.exists) {
            revert AccountDoesNotExist();
        }

        // Check if daily claim cooldown has passed
        if (account.lastDailyClaimTime + DAILY_CLAIM_COOLDOWN > block.timestamp) {
            revert DailyClaimOnCooldown();
        }

        uint256 yieldAmount = levelConfigs[account.membershipLevel].dailyClaimYield;

        if (enbToken.balanceOf(address(this)) < yieldAmount) {
            revert InsufficientContractBalance();
        }

        account.lastDailyClaimTime = block.timestamp;
        account.totalDailyClaims++;
        account.totalYieldClaimed += yieldAmount;

        bool success = enbToken.transfer(user, yieldAmount);
        if (!success) {
            revert TransferFailed();
        }

        emit DailyClaimCompleted(user, yieldAmount, block.timestamp);
        emit YieldDistributed(user, yieldAmount, "daily_claim_yield");
    }

    function upgradeMembership(address user, MembershipLevel targetLevel) external nonReentrant whenNotPaused onlySelf(user) {
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

        bool success = enbToken.transferFrom(user, address(this), requiredTokens);
        if (!success) {
            revert TransferFailed();
        }

        account.membershipLevel = targetLevel;

        emit MembershipUpgraded(user, targetLevel, block.timestamp);
    }

    function distributeTokens(
        address recipient,
        uint256 amount,
        string calldata transactionType
    ) external nonReentrant onlyOwner {
        if (recipient == address(0)) {
            revert InvalidRecipient();
        }
        if (amount == 0) {
            revert InvalidAmount();
        }

        if (enbToken.balanceOf(address(this)) < amount) {
            revert InsufficientContractBalance();
        }

        bool success = enbToken.transfer(recipient, amount);
        if (!success) {
            revert TransferFailed();
        }

        emit YieldDistributed(recipient, amount, transactionType);
    }

    function withdrawTokens(uint256 amount) external nonReentrant onlyOwner {
        if (amount == 0) {
            revert InvalidAmount();
        }

        if (enbToken.balanceOf(address(this)) < amount) {
            revert InsufficientContractBalance();
        }

        bool success = enbToken.transfer(owner(), amount);
        if (!success) {
            revert TransferFailed();
        }

        emit TokensWithdrawn(owner(), amount, block.timestamp);
    }

    function withdrawAllTokens() external nonReentrant onlyOwner {
        uint256 balance = enbToken.balanceOf(address(this));
        if (balance == 0) {
            revert InvalidAmount();
        }

        bool success = enbToken.transfer(owner(), balance);
        if (!success) {
            revert TransferFailed();
        }

        emit TokensWithdrawn(owner(), balance, block.timestamp);
    }

    function pause() external onlyOwner {
        _pause();
        emit ContractPaused(block.timestamp);
    }

    function unpause() external onlyOwner {
        _unpause();
        emit ContractUnpaused(block.timestamp);
    }

    // View functions
    function getUserProfile(address user) external view returns (
        bool exists,
        MembershipLevel membershipLevel,
        uint256 lastDailyClaimTime,
        uint256 totalDailyClaims,
        uint256 totalYieldClaimed,
        uint256 accountCreatedAt
    ) {
        UserAccount storage account = userAccounts[user];
        return (
            account.exists,
            account.membershipLevel,
            account.lastDailyClaimTime,
            account.totalDailyClaims,
            account.totalYieldClaimed,
            account.accountCreatedAt
        );
    }

    function calculateDailyClaimYield(MembershipLevel level) external view returns (uint256) {
        return levelConfigs[level].dailyClaimYield;
    }

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
            return (MembershipLevel.Legendary, 0, false);
        }
    }

    function checkWalletAccountStatus(address user) external view returns (bool) {
        return userAccounts[user].exists;
    }

    function getLastDailyClaimTime(address user) external view returns (uint256) {
        return userAccounts[user].lastDailyClaimTime;
    }

    function getTotalDailyClaims(address user) external view returns (uint256) {
        return userAccounts[user].totalDailyClaims;
    }

    function canClaimDaily(address user) external view returns (bool) {
        UserAccount storage account = userAccounts[user];
        if (!account.exists) {
            return false;
        }
        return account.lastDailyClaimTime + DAILY_CLAIM_COOLDOWN <= block.timestamp;
    }

    function getTimeUntilNextClaim(address user) external view returns (uint256) {
        UserAccount storage account = userAccounts[user];
        if (!account.exists) {
            return 0;
        }
        
        uint256 nextClaimTime = account.lastDailyClaimTime + DAILY_CLAIM_COOLDOWN;
        if (nextClaimTime <= block.timestamp) {
            return 0;
        }
        
        return nextClaimTime - block.timestamp;
    }

    function getContractBalance() external view returns (uint256) {
        return enbToken.balanceOf(address(this));
    }

    function getEnbTokenAddress() external view returns (address) {
        return address(enbToken);
    }
}
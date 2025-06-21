// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract EnbMiniApp is ReentrancyGuard, Pausable {
    IERC20 public immutable enbToken;
    address public immutable deployer;

    enum MembershipLevel { Based, SuperBased, Legendary }

    struct UserAccount {
        bool exists;
        MembershipLevel membershipLevel;
        uint256 lastCheckinTime;
        uint256 totalCheckins;
        uint256 totalYieldClaimed;
        uint256 accountCreatedAt;
    }

    struct LevelConfig {
        uint256 checkinYield;
        uint256 upgradeRequirement;
        string name;
    }

    mapping(address => UserAccount) public userAccounts;
    mapping(MembershipLevel => LevelConfig) public levelConfigs;

    event AccountCreated(address indexed user, uint256 timestamp);
    event CheckinCompleted(address indexed user, uint256 yieldAmount, uint256 timestamp);
    event MembershipUpgraded(address indexed user, MembershipLevel newLevel, uint256 timestamp);
    event YieldDistributed(address indexed user, uint256 amount, string transactionType);
    event ContractPaused(uint256 timestamp);
    event ContractUnpaused(uint256 timestamp);

    error AccountAlreadyExists();
    error AccountDoesNotExist();
    error InvalidMembershipLevel();
    error InsufficientTokensForUpgrade();
    error InsufficientContractBalance();
    error TransferFailed();
    error OnlySelfAllowed();
    error DeployerCannotWithdraw();

    modifier onlySelf(address user) {
        if (msg.sender != user) {
            revert OnlySelfAllowed();
        }
        _;
    }

    modifier notDeployer() {
        if (msg.sender == deployer) {
            revert DeployerCannotWithdraw();
        }
        _;
    }

    constructor(address _enbTokenAddress) {
        require(_enbTokenAddress != address(0), "Invalid token address");

        enbToken = IERC20(_enbTokenAddress);
        deployer = msg.sender;

        levelConfigs[MembershipLevel.Based] = LevelConfig({
            checkinYield: 5 * 10**18,
            upgradeRequirement: 0,
            name: "Based"
        });

        levelConfigs[MembershipLevel.SuperBased] = LevelConfig({
            checkinYield: 10 * 10**18,
            upgradeRequirement: 5000 * 10**18,
            name: "Super Based"
        });

        levelConfigs[MembershipLevel.Legendary] = LevelConfig({
            checkinYield: 15 * 10**18,
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
            lastCheckinTime: 0,
            totalCheckins: 0,
            totalYieldClaimed: 0,
            accountCreatedAt: block.timestamp
        });

        emit AccountCreated(user, block.timestamp);
    }

    function checkin(address user) external nonReentrant whenNotPaused onlySelf(user) notDeployer {
        UserAccount storage account = userAccounts[user];

        if (!account.exists) {
            revert AccountDoesNotExist();
        }

        uint256 yieldAmount = levelConfigs[account.membershipLevel].checkinYield;

        if (enbToken.balanceOf(address(this)) < yieldAmount) {
            revert InsufficientContractBalance();
        }

        account.lastCheckinTime = block.timestamp;
        account.totalCheckins++;
        account.totalYieldClaimed += yieldAmount;

        bool success = enbToken.transfer(user, yieldAmount);
        if (!success) {
            revert TransferFailed();
        }

        emit CheckinCompleted(user, yieldAmount, block.timestamp);
        emit YieldDistributed(user, yieldAmount, "checkin_yield");
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
    ) external nonReentrant notDeployer {
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

    function pause() external {
        _pause();
        emit ContractPaused(block.timestamp);
    }

    function unpause() external {
        _unpause();
        emit ContractUnpaused(block.timestamp);
    }

    // View functions
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

    function calculateCheckinYield(MembershipLevel level) external view returns (uint256) {
        return levelConfigs[level].checkinYield;
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

    function getLastCheckinTime(address user) external view returns (uint256) {
        return userAccounts[user].lastCheckinTime;
    }

    function getTotalCheckins(address user) external view returns (uint256) {
        return userAccounts[user].totalCheckins;
    }

    function getContractBalance() external view returns (uint256) {
        return enbToken.balanceOf(address(this));
    }

    function getEnbTokenAddress() external view returns (address) {
        return address(enbToken);
    }

    function getDeployerAddress() external view returns (address) {
        return deployer;
    }
}

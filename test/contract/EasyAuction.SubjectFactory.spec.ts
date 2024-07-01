import { expect } from "chai";
import { Contract, BigNumber } from "ethers";
import hre, { ethers, waffle } from "hardhat";
import "@nomiclabs/hardhat-ethers";

import {
  encodeOrder,
  queueStartElement,
  createTokensAndMintAndApprove,
  placeOrders,
  calculateClearingPrice,
  getClearingPriceFromInitialOrder,
} from "../../src/priceCalculation";

import {
  createAuctionWithDefaults,
  createAuctionWithDefaultsAndReturnId,
  setSubjectFactoryAddress,
} from "./defaultContractInteractions";
import { closeAuction } from "./utilities";

describe("EasyAuction + Subject Factory", async () => {
  const [
    user_1,
    user_2,
    user_3,
    subject_factory,
  ] = waffle.provider.getWallets();
  let easyAuction: Contract;
  beforeEach(async () => {
    const EasyAuction = await ethers.getContractFactory("EasyAuction");

    easyAuction = await EasyAuction.deploy();
    // As for the existing tests most of the time we are using user_1 will call the functions,
    // so setting the subject factory address to user_1 so that we can test the functions with min change.
    await setSubjectFactoryAddress(easyAuction, subject_factory, user_1);
  });

  describe("initiate Auction with subject factory address", async () => {
    it("throws if initiate auction is called by non subject factory address", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2],
        hre,
      );

      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const orderCancellationEndDate = now + 42;
      const auctionEndDate = now + 1337;
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };

      await expect(
        createAuctionWithDefaults(easyAuction.connect(user_3), {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          orderCancellationEndDate,
          auctionEndDate,
        }),
      ).to.be.revertedWith("Caller is not the subject factory address");
    });
    it("initiateAuction stores the parameters correctly when called by subject factory address", async () => {
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, subject_factory],
        hre,
      );

      const now = (await ethers.provider.getBlock("latest")).timestamp;
      const orderCancellationEndDate = now + 42;
      const auctionEndDate = now + 1337;
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction.connect(subject_factory),
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          orderCancellationEndDate,
          auctionEndDate,
        },
      );
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.auctioningToken).to.equal(auctioningToken.address);
      expect(auctionData.biddingToken).to.equal(biddingToken.address);
      expect(auctionData.initialAuctionOrder).to.equal(
        encodeOrder(initialAuctionOrder),
      );
      expect(auctionData.auctionEndDate).to.be.equal(auctionEndDate);
      expect(auctionData.orderCancellationEndDate).to.be.equal(
        orderCancellationEndDate,
      );
      await expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder({
          userId: BigNumber.from(0),
          sellAmount: ethers.utils.parseEther("0"),
          buyAmount: ethers.utils.parseEther("0"),
        }),
      );
      expect(auctionData.volumeClearingPriceOrder).to.be.equal(0);

      expect(await auctioningToken.balanceOf(easyAuction.address)).to.equal(
        ethers.utils.parseEther("1"),
      );
    });
  });
  describe("settleAuction with subject factory address", async () => {
    it("throws if settle auction is called by non subject factory address", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(10),
          buyAmount: ethers.utils.parseEther("1").div(20),
          userId: BigNumber.from(1),
        },
      ];

      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, subject_factory],
        hre,
      );

      await createAuctionWithDefaults(easyAuction.connect(subject_factory), {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
      });

      const auctionId = BigNumber.from(1);
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      await expect(
        easyAuction.connect(user_1).settleAuction(auctionId),
      ).to.be.revertedWith("Caller is not the subject factory address");
    });

    it("success if settle auction is called by subject factory address", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("1"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("1").div(10),
          buyAmount: ethers.utils.parseEther("1").div(20),
          userId: BigNumber.from(1),
        },
      ];

      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, subject_factory],
        hre,
      );

      await createAuctionWithDefaults(easyAuction.connect(subject_factory), {
        auctioningToken,
        biddingToken,
        auctionedSellAmount: initialAuctionOrder.sellAmount,
        minBuyAmount: initialAuctionOrder.buyAmount,
      });

      const auctionId = BigNumber.from(1);
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);

      const { clearingOrder: price } = await calculateClearingPrice(
        easyAuction,
        auctionId,
      );
      await expect(
        easyAuction.connect(subject_factory).settleAuction(auctionId),
      )
        .to.emit(easyAuction, "AuctionCleared")
        .withArgs(
          auctionId,
          sellOrders[0].sellAmount.mul(price.buyAmount).div(price.sellAmount),
          sellOrders[0].sellAmount,
          encodeOrder(getClearingPriceFromInitialOrder(initialAuctionOrder)),
        );
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(encodeOrder(price));
    });
  });
  describe("settleAuctionAtomically with subject factory address", async () => {
    it("should throw error, if called by non subject factory address", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(1),
        },
      ];
      const atomicSellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.4999"),
          buyAmount: ethers.utils.parseEther("0.4999"),
          userId: BigNumber.from(2),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, subject_factory],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction.connect(subject_factory),
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          isAtomicClosureAllowed: true,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      await expect(
        easyAuction
          .connect(user_1)
          .settleAuctionAtomically(
            auctionId,
            [atomicSellOrders[0].sellAmount],
            [atomicSellOrders[0].buyAmount],
            [queueStartElement],
            "0x",
          ),
      ).to.be.revertedWith("Caller is not the subject factory address");
    });
    it("can settle atomically, if called by subject factory address", async () => {
      const initialAuctionOrder = {
        sellAmount: ethers.utils.parseEther("1"),
        buyAmount: ethers.utils.parseEther("0.5"),
        userId: BigNumber.from(1),
      };
      const sellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.5"),
          buyAmount: ethers.utils.parseEther("0.5"),
          userId: BigNumber.from(1),
        },
      ];
      const atomicSellOrders = [
        {
          sellAmount: ethers.utils.parseEther("0.4999"),
          buyAmount: ethers.utils.parseEther("0.4999"),
          userId: BigNumber.from(2),
        },
      ];
      const {
        auctioningToken,
        biddingToken,
      } = await createTokensAndMintAndApprove(
        easyAuction,
        [user_1, user_2, subject_factory],
        hre,
      );

      const auctionId: BigNumber = await createAuctionWithDefaultsAndReturnId(
        easyAuction.connect(subject_factory),
        {
          auctioningToken,
          biddingToken,
          auctionedSellAmount: initialAuctionOrder.sellAmount,
          minBuyAmount: initialAuctionOrder.buyAmount,
          isAtomicClosureAllowed: true,
        },
      );
      await placeOrders(easyAuction, sellOrders, auctionId, hre);

      await closeAuction(easyAuction, auctionId);
      await easyAuction
        .connect(subject_factory)
        .settleAuctionAtomically(
          auctionId,
          [atomicSellOrders[0].sellAmount],
          [atomicSellOrders[0].buyAmount],
          [queueStartElement],
          "0x",
        );
      const auctionData = await easyAuction.auctionData(auctionId);
      expect(auctionData.clearingPriceOrder).to.equal(
        encodeOrder({
          sellAmount: sellOrders[0].sellAmount.add(
            atomicSellOrders[0].sellAmount,
          ),
          buyAmount: initialAuctionOrder.sellAmount,
          userId: BigNumber.from(0),
        }),
      );
    });
  });
});

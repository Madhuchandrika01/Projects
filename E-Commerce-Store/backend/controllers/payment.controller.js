import Coupon from "../models/coupon.model.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import Product from "../models/product.model.js"; // Import Product model for validation
import { stripe } from "../lib/stripe.js";
import mongoose from "mongoose";

export const createCheckoutSession = async (req, res) => {
  try {
    const { products, couponCode } = req.body;

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: "Invalid or empty products array" });
    }

    let totalAmount = 0;

    const lineItems = products.map((product) => {
      const amount = Math.round(product.price * 100); // Stripe expects amounts in cents
      totalAmount += amount * product.quantity;

      return {
        price_data: {
          currency: "usd",
          product_data: {
            name: product.name,
            images: [product.image],
          },
          unit_amount: amount,
        },
        quantity: product.quantity || 1,
      };
    });

    let coupon = null;
    if (couponCode) {
      coupon = await Coupon.findOne({ code: couponCode, userId: req.user._id, isActive: true });
      if (coupon) {
        totalAmount -= Math.round((totalAmount * coupon.discountPercentage) / 100);
      } else {
        return res.status(400).json({ message: "Invalid or inactive coupon" });
      }
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${process.env.CLIENT_URL}/purchase-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/purchase-cancel`,
      discounts: coupon
        ? [
            {
              coupon: await createStripeCoupon(coupon.discountPercentage),
            },
          ]
        : [],
      metadata: {
        userId: req.user._id.toString(),
        couponCode: couponCode || "",
        products: JSON.stringify(
          products.map((p) => ({
            id: p._id,
            quantity: p.quantity,
            price: p.price,
          }))
        ),
      },
    });

    if (totalAmount >= 20000) {
      await createNewCoupon(req.user._id);
    }

    res.status(200).json({ id: session.id, totalAmount: totalAmount / 100 });
  } catch (error) {
    console.error("Error in createCheckoutSession:", error.message);
    res.status(500).json({ message: "Error processing checkout", error: error.message });
  }
};

export const checkoutSuccess = async (req, res) => {
  let responseSent = false; // Add a flag to track if a response has been sent

  const sendResponse = (status, data) => {
    if (!responseSent) {
      responseSent = true;
      res.status(status).json(data);
    }
  };

  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return sendResponse(400, { message: "Session ID is required" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return sendResponse(400, { message: "Payment not completed" });
    }

    const existingOrder = await Order.findOne({ stripeSessionId: sessionId });
    if (existingOrder) {
      return sendResponse(200, {
        message: "Order already processed",
        orderId: existingOrder._id,
      });
    }

    // Validate metadata
    if (!session.metadata.userId || !session.metadata.products) {
      throw new Error("Missing required metadata in Stripe session");
    }

    // Validate userId as a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(session.metadata.userId)) {
      throw new Error(`Invalid userId in session metadata: ${session.metadata.userId}`);
    }

    // Validate user exists
    const user = await User.findById(session.metadata.userId);
    if (!user) {
      throw new Error(`User not found for userId: ${session.metadata.userId}`);
    }

    // Deactivate coupon if used
    if (session.metadata.couponCode) {
      const coupon = await Coupon.findOneAndUpdate(
        {
          code: session.metadata.couponCode,
          userId: session.metadata.userId,
        },
        { isActive: false },
        { new: true }
      );
      if (!coupon) {
        console.warn(
          `Coupon ${session.metadata.couponCode} not found or already deactivated`
        );
      }
    }

    let products;
    try {
      products = JSON.parse(session.metadata.products);
    } catch (parseError) {
      throw new Error(`Failed to parse products from metadata: ${parseError.message}`);
    }

    if (!Array.isArray(products) || products.length === 0) {
      throw new Error("Products array in metadata is invalid or empty");
    }

    // Validate each product in the array
    for (const product of products) {
      if (!mongoose.Types.ObjectId.isValid(product.id)) {
        throw new Error(`Invalid product ID in session metadata: ${product.id}`);
      }

      const productExists = await Product.findById(product.id);
      if (!productExists) {
        throw new Error(`Product not found for ID: ${product.id}`);
      }

      if (!product.quantity || product.quantity < 1) {
        throw new Error(`Invalid quantity for product ID ${product.id}: ${product.quantity}`);
      }
      if (!product.price || product.price < 0) {
        throw new Error(`Invalid price for product ID ${product.id}: ${product.price}`);
      }
    }

    const newOrder = new Order({
      user: session.metadata.userId,
      products: products.map((product) => ({
        product: product.id,
        quantity: product.quantity,
        price: product.price,
      })),
      totalAmount: session.amount_total / 100,
      stripeSessionId: sessionId,
    });

    try {
      await newOrder.save();
    } catch (saveError) {
      console.error("Failed to save order to MongoDB:", saveError.message, saveError.stack);
      throw new Error(`Failed to save order to MongoDB: ${saveError.message}`);
    }

    sendResponse(200, {
      success: true,
      message: "Payment successful, order created, and coupon deactivated if used.",
      orderId: newOrder._id,
    });
  } catch (error) {
    console.error("Error in checkoutSuccess:", error.message, error.stack);
    sendResponse(500, { message: "Error processing successful checkout", error: error.message });
  }
};

export const clearCartAfterPayment = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.cartItems = [];
    await user.save();

    res.status(200).json({ success: true, message: "Cart cleared successfully" });
  } catch (error) {
    console.error("Error in clearCartAfterPayment:", error.message);
    res.status(500).json({ message: "Error clearing cart", error: error.message });
  }
};

async function createStripeCoupon(discountPercentage) {
  try {
    const coupon = await stripe.coupons.create({
      percent_off: discountPercentage,
      duration: "once",
    });
    return coupon.id;
  } catch (error) {
    console.error("Error creating Stripe coupon:", error.message);
    throw new Error("Failed to create Stripe coupon");
  }
}

async function createNewCoupon(userId) {
  try {
    await Coupon.findOneAndDelete({ userId });

    const newCoupon = new Coupon({
      code: "GIFT" + Math.random().toString(36).substring(2, 8).toUpperCase(),
      discountPercentage: 10,
      expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      userId: userId,
    });

    await newCoupon.save();
    return newCoupon;
  } catch (error) {
    console.error("Error creating new coupon:", error.message);
    throw new Error("Failed to create new coupon");
  }
}
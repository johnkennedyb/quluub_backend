const { db } = require("./controllers/connect.js");
const { v4: uuidv4 } = require("uuid");

const nodeMailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

const hbs = require("nodemailer-express-handlebars");
const path = require("path");

const stripe = require("stripe")(process.env.STRIPE_SECRET_API_KEY);

const https = require("https");

dotenv.config();

const plans = {
  freemium: {
    requestsSentPerMonth: 2,
    requestsReceivedPerMonth: "Unlimited",
    messageAllowance: 10,
    wordCountPerMessage: 20,
    nairaPrice: 0,
    internationalPrice: 0,
    discountPercent: 0,
    adverts: "Yes",
    name: "freemium",
  },
  premium: {
    requestsSentPerMonth: 5,
    requestsReceivedPerMonth: "Unlimited",
    messageAllowance: 10,
    wordCountPerMessage: 20,
    nairaPrice: 5000,
    internationalPrice: 5,
    discountPercent: 60,
    adverts: "No",
    name: "premium",
  },
};

// Configure handlebars options
const handlebarOptions = {
  viewEngine: {
    extName: ".handlebars",
    partialsDir: path.resolve("./emailTemplates/partials"),
    defaultLayout: false,
  },
  viewPath: path.resolve("./emailTemplates/templates"),
  extName: ".handlebars",
};

// Simple logger that won't fail if console is not available
const logger = {
  log: (...args) => typeof console !== 'undefined' && console.log(...args),
  error: (...args) => typeof console !== 'undefined' && console.error(...args)
};

const sendMail = async (to, subject, template, context = {}) => {
  try {
    const ENV = process.env.ENV || 'development';
    const isLive = ["prod", "uat"].includes(ENV);
    
    // For non-live environments, use test email or local logging
    if (!isLive && ENV !== "local") {
      to = "test@quluub.com";
      logger.log(`[${ENV} ENV] Email would be sent to:`, to);
    }

    // Format recipients - handle both string and array inputs
    const formatRecipients = (recipients) => {
      try {
        if (!recipients) return [];
        const emails = Array.isArray(recipients) ? recipients : [recipients];
        return emails.map(email => {
          if (typeof email === 'object' && email.address) {
            return {
              address: email.address,
              name: email.name || email.address.split('@')[0]
            };
          }
          const emailStr = String(email).trim();
          return {
            address: emailStr,
            name: emailStr.split('@')[0]
          };
        });
      } catch (error) {
        logger.error('Error formatting recipients:', error);
        return [];
      }
    };

    const emailData = {
      from: { 
        address: process.env.MAIL_FROM || 'admin@quluub.com', 
        name: process.env.MAIL_FROM_NAME || 'Quluub Admin' 
      },
      to: formatRecipients(to),
      subject: subject || 'No Subject',
      text: context?.text || subject || '',
      html: context?.html || `<p>${context?.text || subject || ''}</p>`,
      reply_to: { 
        address: process.env.MAIL_REPLY_TO || 'noreply@quluub.com',
        name: process.env.MAIL_REPLY_NAME || 'Quluub No-Reply'
      }
    };

    // For local development, log the email instead of sending
    if (ENV === "local") {
      logger.log("\n=== LOCAL EMAIL NOTIFICATION ===");
      logger.log("To:", to);
      logger.log("Subject:", subject);
      if (template) logger.log("Template:", template);
      if (context) logger.log("Context:", JSON.stringify(context, null, 2));
      logger.log("==============================\n");
      return true;
    }

    const apiKey = process.env.MAILEROO_API_KEY || "fdfbe57cf3c414c1d6d5959b948aee7794ab8d742ef6be681ef15bbf78dd201b";
    const baseUrl = process.env.MAILEROO_BASE_URL || "https://smtp.maileroo.com/api/v2";
    const endpoint = "/emails";

    // Skip sending if no recipients
    if (!emailData.to || emailData.to.length === 0) {
      logger.error('No valid recipients provided');
      return false;
    }

    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify(emailData)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || `HTTP error! status: ${response.status}`);
      }

      logger.log("Email sent successfully. Reference ID:", result.data?.reference_id);
      return true;
    } catch (error) {
      logger.error("Error sending email via Maileroo API:", error.message);
      if (error.response) {
        logger.error("Response data:", error.response.data);
      }
      return false;
    }
  } catch (error) {
    logger.error("Unexpected error in sendMail:", error);
    return false;
  }
};

const generateToken = (payload, expiresIn = "1d") => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

const verifyAndRefreshToken = (req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  const token = req.cookies.accessToken;

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  // Verify the token
  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Token expired" });
      } else {
        return res.status(401).json({ error: "Invalid token" });
      }
    }

    // Token is valid, refresh it
    const newToken = jwt.sign({ id: decoded.id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    //Update last seen
    const now = new Date();
    const isoString = replaceIsoTZ(now.toISOString());

    await logLogin(decoded.id, isoString);

    // Attach the new token to the response
    // res.locals.newToken = newToken;
    res.cookie("accessToken", newToken, {
      httpOnly: true,
    });

    // Attach the decoded payload to the request object
    // req.user = decoded;
    req.userInfo = decoded;

    // Proceed to the next middleware or route handler
    next();
  });
};

const mailSignature = `JazaakumuLlahu khairan, <br/>The ${process.env.APP_NAME} Team <br/>Where every heart finds a home.`;

const loginLink = `${process.env.WEB_DOMAIN}/login`;

const profileLink = `${process.env.WEB_DOMAIN}/profile`;

const whatsappChannelLink = `https://whatsapp.com/channel/0029VaqaEwjL7UVYhsQind1M`;

const capitalizeFirstLetter = (string) => {
  return string?.length > 0
    ? string.charAt(0).toUpperCase() + string.slice(1)
    : string;
};

const replaceIsoTZ = (string) => {
  return string.slice(0, 19).replace("T", " ");
};

function isWithinLastMonth(timestamp) {
  // Get the current date and time
  const currentDate = new Date();

  // Create a new Date object representing one month ago
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(currentDate.getMonth() - 1);

  // Convert the given timestamp to a Date object
  const givenDate = new Date(
    typeof timestamp === "number" ? timestamp * 1000 : timestamp
  );

  // Check if the given date is after one month ago
  return givenDate >= oneMonthAgo && givenDate <= currentDate;
}

function isMoreThanTwentyDaysAgo(timestamp) {
  // Get the current date
  const currentDate = new Date();

  // Calculate the date 20 days ago
  const twentyDaysAgo = new Date();
  twentyDaysAgo.setDate(currentDate.getDate() - 20);

  // Convert the given timestamp to a Date object
  const givenDate = new Date(
    typeof timestamp === "number" ? timestamp * 1000 : timestamp
  );

  // Compare the provided date with the date 20 days ago
  return givenDate < twentyDaysAgo;
}

const findAllActiveUsers = () => {
  const q = "SELECT * FROM users WHERE type='REGULAR' ";

  return new Promise((resolve, reject) => {
    db.query(q, (err, data) => {
      if (err) {
        console.error(err);
        reject(err);
      }

      if (data) {
        resolve(data);
      }
    });
  });
};

const findReceived = (userId, withRejected = true) => {
  let q;
  if (withRejected) {
    q = `SELECT * FROM relationships 
    WHERE followed_user_id = ?;
    `;
  } else {
    q = `SELECT * FROM relationships 
    WHERE followed_user_id = ? and status IS NULL;
    `;
  }

  return new Promise((resolve, reject) => {
    db.query(q, [userId], (err, result) => {
      if (err) {
        reject(err);
      }

      resolve(result);
    });
  });
};

const findSent = (userId, withRejected = true) => {
  let q;
  if (withRejected) {
    q = `SELECT * FROM relationships 
  WHERE follower_user_id = ?;
  `;
  } else {
    q = `SELECT * FROM relationships 
  WHERE follower_user_id = ? and status IS NULL;
  `;
  }

  return new Promise((resolve, reject) => {
    db.query(q, [userId], (err, result) => {
      if (err) {
        reject(err);
      }

      resolve(result);
    });
  });
};

const findMatches = (userId) => {
  const q = `SELECT r1.*, 
  GREATEST(r1.created, r2.created) AS latest_follow_date
  FROM relationships r1
  JOIN relationships r2
  ON r1.follower_user_id = r2.followed_user_id AND r1.followed_user_id = r2.follower_user_id
  WHERE r1.follower_user_id = ?;
  `;

  return new Promise((resolve, reject) => {
    db.query(q, [userId], (err, result) => {
      if (err) {
        reject(err);
      }

      resolve(result);
    });
  });
};

const getLogCountSinceDateForOneMonth = (currentUserID, action, date) => {
  const q = `SELECT count(*) as ${action} FROM user_activity_log WHERE userId = "${currentUserID}" 
  AND action = "${action}" 
  AND created >= "${date}"
  AND created < "${date}" + INTERVAL 30 DAY; `;

  return new Promise((resolve, reject) => {
    db.query(q, [currentUserID, action], (err, data) => {
      if (err) {
        reject(err);
      }

      resolve(data[0][action]);
    });
  });
};

const clearChat = async (currentUserID, contactID) => {
  const q =
    "DELETE FROM chat WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?) ";

  const params = [currentUserID, contactID, contactID, currentUserID];

  return new Promise((resolve, reject) => {
    db.query(q, params, (err, data) => {
      if (err) reject(err);

      if (data) {
        resolve(data);
      }
    });
  });
};

const getMultipleUsersByIDs = (ids, withId = false) => {
  const placeholders = ids.map(() => "?").join(", ");

  if (ids.length < 1) {
    return new Promise((resolve) => {
      resolve([]);
    });
  }

  const q = `SELECT * FROM users WHERE id IN (${placeholders}) ORDER BY FIELD(id, ${placeholders})`;

  return new Promise((resolve, reject) => {
    db.query(q, [...ids, ...ids], (err, result) => {
      if (err) {
        console.log(err);
        reject(err);
      }

      const data = result?.map((user) => {
        if (withId) {
          const { password, ...info } = user;
          return info;
        } else {
          const { password, id, ...info } = user;
          return info;
        }
      });
      resolve(data);
    });
  });
};

const logLogin = (id, value) => {
  const q = `UPDATE users SET lastSeen = ? WHERE id = ? `;

  const values = [value, id];

  return new Promise((resolve, reject) => {
    db.query(q, values, (err) => {
      if (err) {
        reject(err);
      }

      resolve(true);
    });
  });
};

const findUser = (userId, returnAll = false) => {
  const q = "SELECT * FROM users WHERE id=? or username=? or email=? ";

  return new Promise((resolve, reject) => {
    db.query(q, [userId, userId, userId], (err, result) => {
      if (err) {
        console.error(err);
        reject(err);
      }

      if (returnAll) {
        resolve(result[0]);
      } else {
        const { created, updated, deleted, ...info } = result[0];

        delete info.password;

        resolve(info);
      }
    });
  });
};

const getLogCountThisMonth = (currentUserID, action) => {
  const q = `SELECT count(*) as ${action} FROM user_activity_log WHERE userId = ? 
  AND action = ? 
  AND created >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
  AND created < DATE_FORMAT(CURDATE() + INTERVAL 1 MONTH, '%Y-%m-01'); `;

  return new Promise((resolve, reject) => {
    db.query(q, [currentUserID, action], (err, data) => {
      if (err) {
        reject(err);
      }

      resolve(data[0][action]);
    });
  });
};

const logProfileAction = (userId, receiverId, action) => {
  const q =
    "INSERT INTO user_activity_log (`id`,`userId`,`receiverId`,`action`) VALUES (?)";
  const values = [uuidv4(), userId, receiverId, action];

  return new Promise((resolve, reject) => {
    db.query(q, [values], (err) => {
      if (err) {
        reject(err);
      }

      resolve(true);
    });
  });
};

const formatDate = (prop) => {
  if (prop === null) {
    return "0000-00-00 00:00:00";
  }

  const date = new Date(prop);

  if (isNaN(date.getFullYear())) {
    return "0000-00-00 00:00:00";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-based
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

const getStripeSession = async (session_id) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    return session;
  } catch (error) {
    return false;
  }
};

const getPaystackTransaction = (reference) => {
  const { PAYSTACK_SECRET_API_KEY } = process.env;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.paystack.co",
      port: 443,
      path: `/transaction/verify/${reference}`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_API_KEY}`,
        "Content-Type": "application/json",
      },
    };

    const request = https.request(options, (response) => {
      let data = "";

      response.on("data", (chunk) => {
        data += chunk;
      });

      response.on("end", () => {
        try {
          const parsedData = JSON.parse(data);
          resolve(parsedData); // Return the parsed data by resolving the promise
        } catch (error) {
          reject(false); // Handle JSON parsing errors
        }
      });
    });

    request.on("error", (error) => {
      reject(false); // Handle network errors
    });

    request.end();
  });
};

const canAdd = async (userID) => {
  // rethink this later in life
  // for now, if you are a freemium user then
  // you can add if your req - withdraw is less than allocated amt for the month

  // same for premium except month starts when you paid
  // so req since payment - withdraw since payment should be less then premium allocation

  // since payment is monthly, if your last payment is more than a month ago then you get same as fremium
  // ideally cron should have returned you to fremium anyways but we have a check here just incase

  //month start in this case because of no sub
  let requestsSinceSub = await getLogCountThisMonth(userID, "FOLLOWED");
  let withdrawalsSinceSub = await getLogCountThisMonth(userID, "WITHDREW");

  const { plan: userPlan, sessionId } = await findUser(userID);

  const { requestsSentPerMonth } = plans?.[userPlan] || plans?.["freemium"];

  let type = "free";

  if (userPlan === plans.premium.name) {
    if (!isNaN(parseInt(sessionId))) {
      const checkedSession = await getPaystackTransaction(sessionId);

      console.log("canadd paystack", sessionId);

      if (
        checkedSession?.data?.status === "success" &&
        isWithinLastMonth(checkedSession?.data?.created_at)
      ) {
        const paystackCreatedAtISOUtcString = replaceIsoTZ(
          checkedSession?.data?.created_at
        );

        requestsSinceSub = await getLogCountSinceDateForOneMonth(
          userID,
          "FOLLOWED",
          paystackCreatedAtISOUtcString
        );

        withdrawalsSinceSub = await getLogCountSinceDateForOneMonth(
          userID,
          "WITHDREW",
          paystackCreatedAtISOUtcString
        );

        type = "ps";
      }
    } else {
      const checkedSession = await getStripeSession(sessionId);

      console.log("canadd stripe", sessionId);

      if (checkedSession && isWithinLastMonth(checkedSession.created)) {
        const stripeCreatedAtISOUtcString = replaceIsoTZ(
          new Date(checkedSession.created * 1000).toISOString()
        );

        requestsSinceSub = await getLogCountSinceDateForOneMonth(
          userID,
          "FOLLOWED",
          stripeCreatedAtISOUtcString
        );

        withdrawalsSinceSub = await getLogCountSinceDateForOneMonth(
          userID,
          "WITHDREW",
          stripeCreatedAtISOUtcString
        );
        type = "st";
      }
    }
  }

  let requestsThisMonth = requestsSinceSub - withdrawalsSinceSub;

  let canAdd = requestsThisMonth < requestsSentPerMonth;

  console.log(canAdd, requestsSinceSub, withdrawalsSinceSub, type);

  return {
    canAdd,
    requestsThisMonth,
    requestsSentPerMonth,
  };
};

const badInput = (res, field) => {
  return res.status(400).json(`Please use valid input in ${field}`);
};

module.exports = {
  plans,
  sendMail,
  generateToken,
  verifyAndRefreshToken,
  mailSignature,
  loginLink,
  profileLink,
  whatsappChannelLink,
  capitalizeFirstLetter,
  isWithinLastMonth,
  isMoreThanTwentyDaysAgo,
  findAllActiveUsers,
  findReceived,
  findSent,
  findMatches,
  getMultipleUsersByIDs,
  logLogin,
  formatDate,
  getLogCountSinceDateForOneMonth,
  findUser,
  getLogCountThisMonth,
  logProfileAction,
  getStripeSession,
  getPaystackTransaction,
  canAdd,
  clearChat,
  badInput,
  replaceIsoTZ,
};

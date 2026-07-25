import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
	service: "gmail",
	auth: {
		user: process.env.EMAIL, // Make sure this is in your .env
		pass: process.env.APP_EMAIL_PASSWORD, // Make sure this is in your .env
	},
});

/**
 * Sends an email dynamically.
 * @param {string} to - The recipient's email address
 * @param {string} subject - The subject of the email
 * @param {string} text - The body of the email
 * @param {string} [fromName="GoldFish Enterprise"] - Optional custom sender name
 */
export const sendEmail = async (
	to,
	subject,
	text,
	fromName = "GoldFish Enterprise",
) => {
	const mailOptions = {
		from: `"${fromName}" <${process.env.EMAIL}>`,
		to: to,
		subject: subject,
		text: text,
	};

	try {
		const info = await transporter.sendMail(mailOptions);
		// console.log('Email sent successfully: ' + info.response);
		return { success: true, info };
	} catch (error) {
		console.error("Error sending email:", error);
		return { success: false, error };
	}
};

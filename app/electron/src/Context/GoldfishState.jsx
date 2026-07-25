import React, { useState } from "react";
import goldfishContext from "./goldFishContext";

function GoldfishState(props) {
	const host = import.meta.env.VITE_BACKEND_HOST || "http://localhost:3000";
	const [user, setUser] = useState(null);
	const [loading, setLoading] = useState(false);

	const login = async (email, password) => {
		setLoading(true);
		try {
			const response = await fetch(`${host}/api/auth/login`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password }),
			});
			const data = await response.json();
			setLoading(false);

			if (data.success) {
				if (data.requires2FA) {
					return { success: true, requires2FA: true, email };
				}
				localStorage.setItem("token", data.token);
				setUser(data.user);
				return { success: true, requires2FA: false };
			} else {
				const errorMsg =
					data.errors && data.errors.length > 0
						? data.errors[0].msg
						: data.error || "Login failed";
				return { success: false, error: errorMsg };
			}
			//eslint-disable-next-line
		} catch (error) {
			setLoading(false);
			return {
				success: false,
				error: "Something went wrong. Please try again.",
			};
		}
	};

	const verifyLoginOtp = async (email, otp) => {
		setLoading(true);
		try {
			const response = await fetch(`${host}/api/auth/verify-otp`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, otp }),
			});
			const data = await response.json();
			setLoading(false);

			if (data.success) {
				localStorage.setItem("token", data.token);
				setUser(data.user);
				return { success: true };
			} else {
				return {
					success: false,
					error: data.error || "Verification failed",
				};
			}
			//eslint-disable-next-line
		} catch (error) {
			setLoading(false);
			return { success: false, error: "Something went wrong." };
		}
	};

	const signup = async (name, email, password) => {
		setLoading(true);
		try {
			const response = await fetch(`${host}/api/auth/signup`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, email, password }),
			});
			const data = await response.json();
			setLoading(false);

			if (data.success) {
				if (data.requires2FA) {
					return { success: true, requires2FA: true, email };
				}
				localStorage.setItem("token", data.token);
				setUser(data.user);
				return { success: true, requires2FA: false };
			} else {
				const errorMsg =
					data.errors && data.errors.length > 0
						? data.errors[0].msg
						: data.error || "Signup failed";
				return { success: false, error: errorMsg };
			}
			//eslint-disable-next-line
		} catch (error) {
			setLoading(false);
			return { success: false, error: "Something went wrong." };
		}
	};

	const verifySignupOtp = async (email, otp) => {
		setLoading(true);
		try {
			const response = await fetch(`${host}/api/auth/verify-signup-otp`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, otp }),
			});
			const data = await response.json();
			setLoading(false);

			if (data.success) {
				localStorage.setItem("token", data.token);
				setUser(data.user);
				return { success: true };
			} else {
				return {
					success: false,
					error: data.error || "Verification failed",
				};
			}
			//eslint-disable-next-line
		} catch (error) {
			setLoading(false);
			return { success: false, error: "Something went wrong." };
		}
	};

	const getUser = async () => {
		setLoading(true);
		try {
			const response = await fetch(`${host}/api/user/getuser`, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${localStorage.getItem("token")}`,
					"X-Client-Type": "app",
				},
			});
			const json = await response.json();
			if (json.success) {
				setUser(json.user);
			} else {
				setUser(null);
			}
		} catch (error) {
			console.error("getUser error:", error);
			setUser(null);
		} finally {
			setLoading(false);
		}
	};

	// useEffect(() => {
	// 	getUser();
	// }, []);

	const logout = () => {
		localStorage.removeItem("token");
		setUser(null);
	};

	const upgradeSubscription = async (tier) => {
		try {
			const response = await fetch(`${host}/api/user/upgrade`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": `Bearer ${localStorage.getItem("token")}`,
					"X-Client-Type": "app",
				},
				body: JSON.stringify({ tier }),
			});
			const json = await response.json();
			if (json.success) {
				// Update local user state immediately
				setUser(prev => ({ ...prev, token_count: json.token_count, tier: json.tier }));
			}
			return json;
		} catch (error) {
			console.error("Upgrade error:", error);
			return { success: false, error: "Network or server error. Check console." };
		}
	};

	return (
		<goldfishContext.Provider
			value={{
				user,
				loading,
				login,
				signup,
				verifyLoginOtp,
				verifySignupOtp,
				getUser,
				logout,
				upgradeSubscription,
			}}
		>
			{props.children}
		</goldfishContext.Provider>
	);
}

export default GoldfishState;

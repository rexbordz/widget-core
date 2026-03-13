async function getTwitchAvatar(username) {
  const url = `https://decapi.me/twitch/avatar/${encodeURIComponent(username)}`;

  try {
    const response = await fetch(url);
    return await response.text();

  } catch (err) {
    console.error(`[getTwitchAvatar] Error fetching avatar for "${username}": ${err.message}`);
  }
}

async function getKickAvatar(username) {
  try {
    const response = await fetch(`https://kick.com/api/v2/channels/${username}`);
    const data = await response.json();
	const genericAvatar = "https://files.kick.com/images/user/4545493/profile_image/conversion/default1-medium.webp";
    let profilePicUrl = data.user?.profile_pic || genericAvatar;

    if (profilePicUrl) {
      // Replace 'fullsize' with 'medium'
      profilePicUrl = profilePicUrl.replace("fullsize", "medium");
    }
    return profilePicUrl;

  } catch (err) {
    console.error("Error fetching Kick profile picture:", err);
    return genericAvatar;
  }
}

// credits to nutty. Use this to get the super sticker URL.
function FindFirstImageUrl(jsonObject) {
	if (typeof jsonObject !== 'object' || jsonObject === null) {
		return null; // Handle invalid input
	}

	function iterate(obj) {
		if (Array.isArray(obj)) {
			for (const item of obj) {
				const result = iterate(item);
				if (result) {
					return result;
				}
			}
			return null;
		}

		for (const key in obj) {
			if (obj.hasOwnProperty(key)) {
				if (key === 'imageUrl') {
					return obj[key]; // Found it! Return the value.
				}

				if (typeof obj[key] === 'object' && obj[key] !== null) {
					const result = iterate(obj[key]); // Recursive call for nested objects
					if (result) {
						return result; // Propagate the found value
					}
				}
			}
		}
		return null; // Key not found in this level
	}

	return iterate(jsonObject);
}
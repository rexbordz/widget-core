const Utils = {
  async getTwitchAvatar(username) {
    const url = `https://decapi.me/twitch/avatar/${encodeURIComponent(username)}`;

    try {
      const response = await fetch(url);
      return await response.text();

    } catch (err) {
      console.error(`[getTwitchAvatar] Error fetching avatar for "${username}": ${err.message}`);
    }
  },

  async getKickAvatar(username) {
    const genericAvatar = "https://files.kick.com/images/user/4545493/profile_image/conversion/default1-medium.webp";

    try {
      const response = await fetch(`https://kick.com/api/v2/channels/${username}`);
      const data = await response.json();
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
  },

  // credits to nutty. Use this to get the super sticker URL.
  findFirstImageUrl(jsonObject) {
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
  },

  renderTwitchEmotes(message, data) {
    if (!message || !Array.isArray(data?.emotes) || !data.emotes.length) {
      return message;
    }

    let renderedMessage = message;

    for (const emote of data.emotes) {
      if (!emote?.name || !emote?.imageUrl) continue;

      const emoteElement = `<img src="${emote.imageUrl}" class="emote"/>`;

      // Escape regex characters directly here
      const escapedName = emote.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      let regexPattern = escapedName;

      if (/^\w+$/.test(emote.name)) {
        regexPattern = `\\b${escapedName}\\b`;
      } else {
        regexPattern = `(?<=^|[^\\w])${escapedName}(?=$|[^\\w])`;
      }

      const regex = new RegExp(regexPattern, "g");
      renderedMessage = renderedMessage.replace(regex, emoteElement);
    }

    return renderedMessage;
  },

  renderCheermotes(message, data) {
    if (!message || !Array.isArray(data?.cheerEmotes) || !data.cheerEmotes.length) {
      return message;
    }

    let renderedMessage = message;

    for (const cheerEmote of data.cheerEmotes) {
      if (!cheerEmote?.name || !cheerEmote?.bits || !cheerEmote?.imageUrl) continue;

      const bits = cheerEmote.bits;
      const imageUrl = cheerEmote.imageUrl;

      // Escape regex characters directly here
      const escapedName = cheerEmote.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const cheerEmoteElement = `<img src="${imageUrl}" class="emote"/>`;
      const bitsElement = `<span class="bits">${bits}</span>`;

      const regex = new RegExp(`\\b${escapedName}${bits}\\b`, "gi");

      renderedMessage = renderedMessage.replace(
        regex,
        `${cheerEmoteElement}${bitsElement}`
      );
    }

    return renderedMessage;
  },

  async getKickIds(username) {
    // First attempt with the original username
    let url = `https://kick.com/api/v2/channels/${username}`;

    try {
      let response = await fetch(url);
      if (!response.ok) {
        // Retry with underscores replaced by dashes
        const altUsername = username.replace(/_/g, "-");
        url = `https://kick.com/api/v2/channels/${altUsername}`;
        response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
      }

      const data = await response.json();
      if (data.chatroom && data.chatroom.id) {
        return { chatroomId: data.chatroom.id, channelId: data.chatroom.channel_id };
      } else {
        throw new Error("Chatroom ID not found in response.");
      }
    } catch (error) {
      console.error("Failed to fetch chatroom ID:", error.message);
      return null;
    }
  },

  async getKickSubBadges(username) {
    let url = `https://kick.com/api/v2/channels/${username}`;

    try {
      let response = await fetch(url);
      if (!response.ok) {
        // Retry with underscores replaced by dashes
        const altUsername = username.replace(/_/g, "-");
        url = `https://kick.com/api/v2/channels/${altUsername}`;
        response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
      }

      const data = await response.json();
      return data.subscriber_badges || [];
    } catch (error) {
      console.error("Failed to fetch subscriber badges:", error.message);
      return [];
    }
  },

  // Escapes text before it goes into innerHTML. Every user-controlled string
  // in getTwitchMessageFromParts runs through this.
  escapeHtml(value) {
    const chars = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value ?? '').replace(/[&<>"']/g, (char) => chars[char]);
  },

  // credits to vortisRD
  // Builds an HTML string from Twitch's structured `data.parts`. Prefer this
  // over regex-replacing `data.text` — Twitch has already told us exactly where
  // each emote/cheer sits, so there's nothing to pattern-match and no risk of a
  // replacement landing inside a URL of a previously-inserted tag.
  async getTwitchMessageFromParts(parts, data = null) {
    if (!Array.isArray(parts)) return '';

    return parts.map((part) => {
      if (!part) return '';

      switch (part.type) {
        case 'emote': {
          if (part.source === 'Twemoji') {
            return Utils.escapeHtml(part.text);
          }

          let url = part.imageUrl;
          if (!url) return Utils.escapeHtml(part.text);

          switch (part.source) {
            case '7TVChannel':   url = url.replace('/4x', '/1x'); break;
            case 'FrankerFaceZ': url = url.replace('/4', '/1'); break;
            case 'BetterTTV':    url = url.replace('/3x', '/1x'); break;
          }

          const label = Utils.escapeHtml(part.text);
          return `<img src="${Utils.escapeHtml(url)}" alt="${label}" title="${label}" class="emote">`;
        }

        // Cheers were previously dropped (returned ''), which is why a cheer-only
        // message rendered as nothing but the spaces between the cheermotes.
        case 'cheer': {
          if (!part.imageUrl) return Utils.escapeHtml(part.text);

          const label = Utils.escapeHtml(part.text);
          const image = `<img src="${Utils.escapeHtml(part.imageUrl)}" alt="${label}" title="${label}" class="emote">`;

          if (part.bits === undefined || part.bits === null) return image;

          // Only trust a plain hex colour — this value lands in a style attribute.
          const safeColor = /^#[0-9a-f]{3,8}$/i.test(part.color || '') ? part.color : null;
          const style = safeColor ? ` style="color:${safeColor}"` : '';

          return `${image}<span class="bits"${style}>${Utils.escapeHtml(part.bits)}</span>`;
        }

        case 'gif': {
          const url = part.url || part.imageUrl;
          if (!url) return Utils.escapeHtml(part.text);

          // `data` is optional, so fall back to the part's own text rather than
          // throwing when it isn't passed.
          const description = Utils.escapeHtml(String(data?.text ?? part.text ?? '').replace(/[\[\]]/g, ''));
          return `<img class="embedded twitch-giphy-integration" src="${Utils.escapeHtml(url)}" alt="${description}" title="${description}">`;
        }

        default:
          return Utils.escapeHtml(part.text);
      }

    }).join('');
  }
};

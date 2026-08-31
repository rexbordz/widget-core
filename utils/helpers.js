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

  // Kick's channel endpoint is the only source of a user's avatar, and chat
  // handlers ask for one per message — cache so a busy chat doesn't refetch the
  // same picture hundreds of times. Failures aren't cached, so they can retry.
  _kickAvatars: new Map(),

  async getKickAvatar(username) {
    const genericAvatar = "https://files.kick.com/images/user/4545493/profile_image/conversion/default1-medium.webp";
    if (!username) return genericAvatar;
    if (Utils._kickAvatars.has(username)) return Utils._kickAvatars.get(username);

    try {
      const response = await fetch(`https://kick.com/api/v2/channels/${username}`);
      const data = await response.json();
      let profilePicUrl = data.user?.profile_pic || genericAvatar;

      if (profilePicUrl) {
        // Replace 'fullsize' with 'medium'
        profilePicUrl = profilePicUrl.replace("fullsize", "medium");
      }

      Utils._kickAvatars.set(username, profilePicUrl);
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

  // credits to nutty. Use this to resolve messages with emotes.
  renderMessageWithEmotesHtml(originalMessage, emotes) {
    if (!emotes || emotes.length === 0) return originalMessage;

    // Sort emotes by startIndex
    emotes.sort((a, b) => a.startIndex - b.startIndex);

    let html = '';
    let cursor = 0;

    emotes.forEach(emote => {
        // Add text before the emote
        if (emote.startIndex > cursor) {
            html += Utils.escapeHtml(originalMessage.slice(cursor, emote.startIndex));
        }

        // Add emote image
        html += `<img src="${Utils.escapeHtml(emote.imageUrl)}" alt="${Utils.escapeHtml(emote.name)}" title="${Utils.escapeHtml(emote.name)}" class="emote">`;

        cursor = emote.endIndex + 1;
    });

    // Add remaining text after last emote
    if (cursor < originalMessage.length) {
        html += Utils.escapeHtml(originalMessage.slice(cursor));
    }

    return html;
  },

  // TikTok's emote objects carry `emoteImageUrl`/`emoteId` and a single
  // `placeInComment` index rather than a startIndex/endIndex span, so each
  // emote replaces exactly one placeholder character in the comment. Requires
  // tikTokChatEmotes (utils/tiktok-emotes.js) to be loaded first.
  renderTikTokMessageWithEmotesHtml(originalMessage, emotes) {
    const text = String(originalMessage ?? '');

    if (!emotes || emotes.length === 0) return Utils.renderTikTokTextSegment(text);
    const sorted = [...emotes].sort((a, b) => a.placeInComment - b.placeInComment);

    let html = '';
    let cursor = 0;

    sorted.forEach(emote => {
      // Add text before the emote
      if (emote.placeInComment > cursor) {
        html += Utils.renderTikTokTextSegment(text.slice(cursor, emote.placeInComment));
      }

      // Add emote image, replacing the single placeholder character
      const label = Utils.escapeHtml(emote.emoteId ?? '');
      html += `<img src="${Utils.escapeHtml(emote.emoteImageUrl)}" alt="${label}" title="${label}" class="emote">`;

      cursor = emote.placeInComment + 1;
    });

    // Add remaining text after last emote
    if (cursor < text.length) {
      html += Utils.renderTikTokTextSegment(text.slice(cursor));
    }

    return html;
  },

  // Plain text segments can also contain typed shortcodes like "[laughcry]",
  // mapped in tikTokChatEmotes (utils/tiktok-emotes.js) to either a PNG
  // filename served from assets/images/tiktok/emotes/ or a plain unicode
  // emoji. Walk the segment and swap any recognised shortcode in place,
  // escaping everything else.
  renderTikTokTextSegment(segment) {
    let html = '';
    let cursor = 0;
    const shortcodePattern = /\[[a-z0-9_]+\]/gi;
    let match;

    while ((match = shortcodePattern.exec(segment)) !== null) {
      const token = match[0];
      const value = tikTokChatEmotes[token];

      if (value === undefined) continue; // Not a known shortcode, leave as literal text

      html += Utils.escapeHtml(segment.slice(cursor, match.index));

      if (value.endsWith('.png')) {
        const label = Utils.escapeHtml(token);
        html += `<img src="${Utils.escapeHtml(`https://rexbordz.github.io/widget-core/assets/images/tiktok/emotes/${value}`)}" alt="${label}" title="${label}" class="emote">`;
      } else {
        // Value is a plain unicode emoji, not a filename
        html += Utils.escapeHtml(value);
      }

      cursor = match.index + token.length;
    }

    html += Utils.escapeHtml(segment.slice(cursor));
    return html;
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
        // `userId` is what 7TV keys a Kick channel on — not the channel or
        // chatroom id. See getKick7TVEmotes.
        return { chatroomId: data.chatroom.id, channelId: data.chatroom.channel_id, userId: data.user_id };
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

  // The badge SVGs shipped in each widget's assets/images/kick folder. A type
  // that isn't here has no file on disk, so it falls back to a text chip rather
  // than a broken image — Kick adds badge types faster than we add files.
  _kickBadgeTypes: [
    'bot', 'broadcaster', 'founder', 'moderator', 'og',
    'sidekick', 'sub_gifter', 'subscriber', 'verified', 'vip'
  ],

  // credits to vortisRD
  // Kick splits a user's badges across two arrays: `badges` holds the role
  // badges (moderator, subscriber, …) and carries no image at all, while
  // `badges_v2` holds global ones like the level badge and does carry a CDN
  // url. Both sides carry Kick's own `sort_order`, so pool them and sort on it
  // instead of guessing at an order.
  //
  // Returns the { icon, label } descriptors the overlay's badge renderer takes,
  // not HTML — the renderer draws icons as CSS background images.
  getKickBadges(identity, { subBadges = [], iconBase = 'assets/images/kick/' } = {}) {
    const items = [];

    // `selected` is the user's own choice of which global badge to display, so
    // honour it — Kick's chat hides the unselected ones too.
    (identity?.badges_v2 || []).forEach((badge) => {
      if (!badge || badge.badge_type !== 'global' || badge.selected !== true || !badge.image_url) return;

      const level = badge.metadata?.level;
      const label = badge.name === 'level' && level != null ? `level ${level}` : (badge.name || '');
      items.push({ sort: badge.sort_order, icon: badge.image_url, label });
    });

    (identity?.badges || []).forEach((badge) => {
      if (!badge || !badge.type) return;

      let icon = null;
      let fallbackIcon = null;
      if (badge.type === 'subscriber') {
        // Highest tier the user has actually earned. A channel may define no
        // tiers at all, in which case the generic icon stands in. Tier art is
        // served from files.kick.com, which throttles — keep the bundled icon
        // as a fallback the renderer can swap in when a request is dropped.
        const tier = (subBadges || [])
          .filter((b) => b && b.months <= (badge.count ?? 0))
          .sort((a, b) => b.months - a.months)[0];
        fallbackIcon = `${iconBase}badge-subscriber.svg`;
        icon = tier?.badge_image?.src || fallbackIcon;
      } else if (Utils._kickBadgeTypes.includes(badge.type)) {
        icon = `${iconBase}badge-${badge.type}.svg`;
      }

      items.push({ sort: badge.sort_order, icon, fallbackIcon, label: badge.text || badge.type });
    });

    // A missing sort_order sorts last. The sort is stable, so ties keep the
    // badges_v2 entries ahead of the role badges.
    const order = (value) => (typeof value === 'number' ? value : Number.MAX_SAFE_INTEGER);

    return items
      .sort((a, b) => order(a.sort) - order(b.sort))
      .map(({ icon, fallbackIcon, label }) => {
        const entry = { label: String(label ?? '').toUpperCase() };
        if (icon) entry.icon = icon;
        if (fallbackIcon && fallbackIcon !== icon) entry.fallbackIcon = fallbackIcon;
        return entry;
      });
  },

  // Kick sends raw message text with its own emotes inlined as `[emote:id:name]`
  // markers and 7TV emotes left as bare words. Tokenise once and escape each
  // literal run as we go — regex-replacing the whole string and then
  // word-matching the result would run the second pass over the HTML the first
  // pass just inserted.
  getKickMessageHtml(content, emoteMap = null) {
    const text = String(content ?? '');
    const pattern = /\[emote:(\d+):([^\]]*)\]/g;

    let html = '';
    let cursor = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      html += Utils.getKickTextHtml(text.slice(cursor, match.index), emoteMap);

      // The id is digits-only by the pattern, so it is safe in the url.
      const label = Utils.escapeHtml(match[2]);
      html += `<img src="https://files.kick.com/emotes/${match[1]}/fullsize" alt="${label}" title="${label}" class="emote">`;
      cursor = pattern.lastIndex;
    }

    return html + Utils.getKickTextHtml(text.slice(cursor), emoteMap);
  },

  // Escapes a run of plain message text, swapping in any word that names a 7TV
  // emote. Splitting on a capturing group keeps the separators, so runs of
  // spaces and newlines survive instead of collapsing to one space.
  getKickTextHtml(text, emoteMap = null) {
    if (!text) return '';
    if (!emoteMap || !emoteMap.size) return Utils.escapeHtml(text);

    return text.split(/(\s+)/).map((token) => {
      const url = emoteMap.get(token);
      if (!url) return Utils.escapeHtml(token);

      const label = Utils.escapeHtml(token);
      return `<img src="${Utils.escapeHtml(url)}" alt="${label}" title="${label}" class="emote">`;
    }).join('');
  },

  // credits to vortisRD
  // Builds a name -> url map of every 7TV emote usable in a Kick channel.
  // Resolves against Kick's numeric user id (from getKickIds), not the channel
  // or chatroom id. Any failure degrades to whatever loaded, so a 7TV outage
  // costs you 7TV emotes rather than the whole chat.
  async getKick7TVEmotes(kickUserId) {
    const emotes = new Map();

    const load = async (url, label) => {
      try {
        const response = await fetch(url);

        // A channel with no linked 7TV account 404s here — that's expected.
        if (!response.ok) {
          console.debug(`[getKick7TVEmotes] No ${label} emote set (HTTP ${response.status})`);
          return;
        }

        const data = await response.json();
        const list = data?.emote_set?.emotes || data?.emotes || [];

        list.forEach((emote) => {
          if (emote?.name && emote?.id) {
            emotes.set(emote.name, `https://cdn.7tv.app/emote/${emote.id}/1x.webp`);
          }
        });

      } catch (err) {
        console.error(`[getKick7TVEmotes] Failed to load the ${label} emote set:`, err.message);
      }
    };

    // Globals first, so the channel's own set wins a name collision.
    await load('https://7tv.io/v3/emote-sets/global', 'global');
    if (kickUserId) await load(`https://7tv.io/v3/users/kick/${encodeURIComponent(kickUserId)}`, 'channel');

    return emotes;
  },

  // Escapes text before it goes into innerHTML
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

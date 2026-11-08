# Cloud Functions Contracts

## Callable Functions

### createRequest(payload)
- Input: `{ type, urgency, description, location: {lat,lng} }`
- Output: `{ requestId }`

### assignVolunteer({ requestId })
- Coordinator yetkisi gerektirir.
- Output: `{ assignedVolunteerId }`

### claimRequest({ requestId, volunteerLive? })
- Volunteer kendi adina acik talebi ustlenir.
- Output: `{ assignedVolunteerId }`

### transitionRequestStatus({ requestId, action })
- `action`: `START_ROUTE | COMPLETE | REOPEN`
- Output: `{ newStatus }`

### publishAnnouncement(payload)
- Coordinator yetkisi gerektirir.
- Output: `{ announcementId }`

### chatWithAi({ chatId, message, context? })
- Output: `{ aiMessage, escalationFlag }`

### registerDeviceToken({ token, platform })
- Output: `{ ok: true }`

### exportUserData({ uid? })
- Output: `{ signedUrl }`

### requestDataDeletion({ uid? })
- Output: `{ ticketId }`


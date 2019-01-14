self.addEventListener('push', function(event) {
    if (!event.data) {
        console.log('Ignoring push message with no data');
        return;
    }

    const payload = event.data.json();
    console.log('Received push notification', payload);

    event.waitUntil(self.registration.showNotification(payload.title, {
        body: payload.body,
        vibrate: [200, 200]
    }));
});

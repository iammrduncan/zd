function a() { try { risky(); } catch (e) { } }
function b() { try { risky(); } catch (err) { return null; } }
function c() { try { risky(); } catch { } }

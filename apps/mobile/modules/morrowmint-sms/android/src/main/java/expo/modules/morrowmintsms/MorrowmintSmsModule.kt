package expo.modules.morrowmintsms

import android.Manifest
import android.content.pm.PackageManager
import android.provider.Telephony
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Read-only foreground scan. No receiver, background service, SMS send/delete, or network code.
class MorrowmintSmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MorrowmintSms")
    AsyncFunction("readInbox") { since: Double, until: Double, beforeDate: Double, beforeId: String ->
      val context = appContext.reactContext ?: error("Android context unavailable")
      if (context.checkSelfPermission(Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
        throw SecurityException("SMS access is not granted. Use paste or enable access in Settings.")
      }
      val now = System.currentTimeMillis()
      require(since.isFinite() && until.isFinite() && beforeDate.isFinite()) { "Invalid scan interval" }
      val lower = maxOf(since.toLong(), now - 31L * 24 * 60 * 60 * 1000)
      val upper = minOf(until.toLong(), now)
      require(lower <= upper) { "Invalid scan interval" }
      val selection = StringBuilder("date >= ? AND date <= ?")
      val args = mutableListOf(lower.toString(), upper.toString())
      if (beforeDate > 0) {
        require(beforeId.matches(Regex("[0-9]{1,20}"))) { "Invalid inbox cursor" }
        selection.append(" AND (date < ? OR (date = ? AND _id < ?))")
        args.add(beforeDate.toLong().toString()); args.add(beforeDate.toLong().toString()); args.add(beforeId)
      }
      val messages = mutableListOf<Map<String, Any>>()
      var scanned = 0
      var cursorDate = 0L
      var cursorId = ""
      var more = false
      // Bound each bridge call by inbox rows, not matches, so large inboxes cannot block a scan.
      context.contentResolver.query(Telephony.Sms.Inbox.CONTENT_URI,
        arrayOf("_id", "address", "body", "date"), selection.toString(), args.toTypedArray(), "date DESC, _id DESC")?.use { cursor ->
        while (cursor.moveToNext()) {
          if (scanned == 150) { more = true; break }
          scanned++
          cursorId = cursor.getString(0)
          cursorDate = cursor.getLong(3)
          val body = cursor.getString(2) ?: ""
          // Reject security texts before they cross into JavaScript at all.
          if (body.length !in 1..3000 || Regex("\\b(otp|one[ -]time|verification code|authentication code|security code|login code|passcode|2fa|password|cvv|pin)\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)) continue
          if (!Regex("(\\bINR|\\bRs\\.?|₹)", RegexOption.IGNORE_CASE).containsMatchIn(body)) continue
          if (!Regex("\\b(debited|credited|spent|paid|withdrawal|withdrawn|refund|refunded|reversed|sent|received|deposited)\\b", RegexOption.IGNORE_CASE).containsMatchIn(body)) continue
          messages.add(mapOf("id" to cursorId, "sender" to (cursor.getString(1) ?: ""), "body" to body, "receivedAt" to cursorDate.toDouble()))
        }
      } ?: error("The phone SMS provider is unavailable. Use paste instead.")
      mapOf("messages" to messages, "scanned" to scanned, "hasMore" to more, "beforeDate" to cursorDate.toDouble(), "beforeId" to cursorId)
    }
  }
}

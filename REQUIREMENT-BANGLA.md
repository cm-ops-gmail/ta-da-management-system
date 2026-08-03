# সংক্ষেপে আসল রিকোয়ারমেন্ট (docx থেকে)

## এক লাইনে
PeopleOps-এর ভিতরে একটা সম্পূর্ণ ডিজিটাল **Transportation Allowance (TA), Per-Diem, Accommodation ও Travel Management System** বানাতে হবে — যেখানে কর্মী রিকোয়েস্ট দেবে, ডিজিটালি অ্যাপ্রুভাল হবে, Finance পেমেন্ট করবে, আর কর্মী পুরো যাত্রাটা লাইভ ট্র্যাক করতে পারবে। কাগজ-কলম শূন্য, পলিসি-চালিত, ম্যানুয়াল হিসাব শূন্য।

## মূল কথা: কর্মী পলিসি জানবে না, সিস্টেম জানবে
কর্মী শুধু তথ্য দেবে (কোথায় গেছে, কখন, কী কাজে)। **কে কোন গাড়ি পাবে, কত টাকা পাবে, per-diem পাবে কিনা — সব সিস্টেম নিজে হিসাব করবে** Band, Gender ও Team size দেখে। অযোগ্য অপশন স্ক্রিনেই দেখাবে না।

## ১. ফ্লো
লগইন → TA & Per-Diem → নতুন রিকোয়েস্ট → **Inside City / Outside City** → ডিটেইলস → ডকুমেন্ট আপলোড → সাবমিট → **লাইন ম্যানেজার → অ্যাডমিন → ফাইন্যান্স → পেমেন্ট → Completed**।
প্রতিটি ধাপে Approve / Reject / Return / Remarks / অতিরিক্ত ডকুমেন্ট চাওয়ার সুযোগ থাকবে।

## ২. ড্যাশবোর্ড
+ New Request, My Requests, Travel Advance, Travel History, Pending Approvals, Payment History।
উপরে সামারি কার্ড: Pending, Approved, Rejected, Payment Pending, Paid, Total Claims।

## ৩. Inside City (ঢাকা / চট্টগ্রাম)
কর্মী বেছে নেবে: **TA only / Per-Diem only / TA + Per-Diem**।

**ট্রান্সপোর্ট (Band অনুযায়ী অটো):**
- Band E2–G: রিকশা, বাইক, CNG (গাড়ি শুধু অ্যাপ্রুভাল থাকলে; **মহিলা কর্মী হলে CNG ও Car এমনিতেই দেখাবে**)
- Band D ও উপরে: রিকশা, CNG, Car

**টিম ট্রাভেল:** Employee ID/নাম দিয়ে সদস্য যোগ করলে Department, Designation, Band অটো আসবে।
- সদস্য ২ জন → শুধু রিকশা ও CNG (Car বন্ধ)
- সদস্য ৩ বা বেশি → রিকশা, CNG, Car

**গাড়ির ধরন:**
- কোম্পানির গাড়ি → কোনো টাকা নেই
- নিজের গাড়ি/বাইক → KM × অ্যাডমিন-নির্ধারিত ফুয়েল রেট = অটো হিসাব
- রাইড শেয়ারিং → রসিদ / ইনভয়েস / ট্রিপ স্ক্রিনশট / পেমেন্ট প্রুফ লাগবে

## ৪. Per-Diem ও লাঞ্চ (অটো যোগ্যতা)
কর্মী দেবে: কোথায় কাজ করেছে (Office/Partner/University/Vendor/Stakeholder/Other), Purpose, Start Time, End Time। সিস্টেম কর্মঘণ্টা হিসাব করবে —
- **৫ ঘণ্টা বা বেশি → Per-Diem ৳২৫০ অটো অ্যাপ্রুভড**, লাঞ্চ এর মধ্যেই ধরা, তাই **লাঞ্চ অ্যালাউন্স বন্ধ**
- **৫ ঘণ্টার কম** → জিজ্ঞেস করবে "লাঞ্চের সময় কাজ করেছেন?" → হ্যাঁ হলে **লাঞ্চ অ্যালাউন্স ৳১৫০**
- অফিসের খাবার খেয়ে থাকলে (Office Meal = Yes) → লাঞ্চ অ্যালাউন্স বন্ধ। **ডাবল খাবারের দাবি কোনোভাবেই যাবে না।**

**Dual Workstation** (চেকবক্স + নির্দিষ্ট অপশন: HQ Scheduled Day / SBM / Tele Sales / Shooting / Other) → TA ও Per-Diem দুটোই পাবে, কিন্তু কোম্পানির খাবার দেওয়া হলে ডুপ্লিকেট মিল ক্লেইম বন্ধ।

## ৫. Outside City
কর্মী বেছে নেবে **Company Arrangement** নাকি **Self Arrangement**।
Company Arrangement হলে **কমপক্ষে ২ কর্মদিবস আগে** রিকোয়েস্ট দিতে হবে, না হলে সিস্টেম আটকে দেবে; ঠিক থাকলে অ্যাডমিন টিমকে অটো নোটিফাই করবে।

**Band অনুযায়ী অটো রেট (কোনো ম্যানুয়াল হিসাব নেই):**

| Band | TA | Weekday | Weekend | Accommodation | Flight |
|---|---|---|---|---|---|
| A–B | Actual | ১০০০ | ১৮০০ | ৫০০০ | হ্যাঁ |
| C–E | Actual | ৯০০ | ১৩৫০ | ৪০০০ | না |
| F | Actual | ৮০০ | ১২০০ | ৩০০০ | না |
| G | Actual | ৭০০ | ১০৫০ | ২০০০ | না |

Outside City Per-Diem-এর মধ্যে TA + ৩ বেলা খাবার ধরা — আলাদা TA ক্লেইম হবে না।
**Accommodation:** হোটেল নাম, চেক-ইন, চেক-আউট, রসিদ, টাকা — Band লিমিটের বেশি হলে সিস্টেম আটকাবে (actual bill, লিমিট পর্যন্ত)।
**Car Pool (Band C–G):** রেন্ট-এ-কার নিলে ৩ জনের কম হলে রিজেক্ট, ৩ জন হলে সর্বোচ্চ ৳৬০০০ (one way); বেশি হলে স্পেশাল অ্যাপ্রুভাল।

## ৬. Advance (শুধু Outside City)
ট্রিপ **৩ দিনের বেশি** হলেই অপশন আসবে। ৳১০,০০০ পর্যন্ত → Line Manager + HR অ্যাপ্রুভাল। **৳১০,০০০-এর বেশি হলে অতিরিক্ত Department Head অ্যাপ্রুভাল**। ট্রিপ শেষে **৩ কর্মদিবসের মধ্যে সেটেলমেন্ট বাধ্যতামূলক**।

## ৭. ডকুমেন্ট
টিকিট, বিল, রসিদ, ইনভয়েস, হোটেল বিল, রাইড-শেয়ারিং রসিদ, ফুয়েল হিসাব, সাপোর্টিং ডকুমেন্ট — Drag & Drop, মোবাইল ক্যামেরা, PDF ও ছবি।

## ৮. লাইভ ট্র্যাকিং
প্রতিটি রিকোয়েস্টে প্রোগ্রেস বার ও টাইমলাইন: Submitted → Manager Approved → Admin Approved → Finance Approved → Payment Sent → Completed। প্রতি ধাপে **কে, কখন, কী মন্তব্য** এবং পরের ধাপ কী — সব দেখা যাবে। কাউকে ফোন করে জিজ্ঞেস করতে হবে না।

## ৯. Finance স্ক্রিন
এক পেজে সব: Employee, Travel Type, Band, Destination, Total Amount, Receipts, Accommodation, Per-Diem, Advance Adjustment, **Final Payable**। ডুপ্লিকেট চেক ও রসিদ চেক। বাটন: Approve / Return / Reject / Mark Paid / Pay via bKash। পেমেন্ট মোড: Bank / bKash / Nagad + Transaction ID + Payment Date।

## ১০. নোটিফিকেশন
Submitted, Approved, Rejected, Returned, Payment Sent, Settlement Due, Advance Approved — অ্যাপ ও ইমেইলে (SMS ঐচ্ছিক)।

## ১১. Admin Configuration (সবচেয়ে গুরুত্বপূর্ণ শর্ত)
**পলিসি বদলাতে কোনো কোড পরিবর্তন লাগবে না।** অ্যাডমিন প্যানেল থেকেই বদলানো যাবে: Band, Band/Gender অনুযায়ী ট্রান্সপোর্ট, টিম ট্রাভেল রুল, ফুয়েল রেট, Per-Diem রেট, লাঞ্চ অ্যালাউন্স, Accommodation লিমিট, রেন্ট-এ-কার লিমিট, ফ্লাইট যোগ্যতা, অ্যাপ্রুভাল হায়ারার্কি, সিটি ও ট্রাভেল জোন, পেমেন্ট মেথড, পলিসির কার্যকর তারিখ।

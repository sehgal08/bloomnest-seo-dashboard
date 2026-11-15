"""Made-up content for the fictional parenting site BloomNest: topics, title patterns and search phrases.

Everything here is generic parenting vocabulary written for this demo. It is not taken from any real site.
"""

# (topic, stage) — stage decides which title patterns fit
TOPICS = [
    ('Morning Sickness', 'pregnancy'), ('Back Pain', 'pregnancy'), ('Heartburn', 'pregnancy'), ('Leg Cramps', 'pregnancy'),
    ('Sugar Levels While Expecting', 'pregnancy'), ('Iron Deficiency', 'pregnancy'), ('Folic Acid', 'pregnancy'), ('Baby Kicks', 'pregnancy'),
    ('Sleeping Positions', 'pregnancy'), ('Swollen Feet', 'pregnancy'), ('Stretch Marks', 'pregnancy'), ('Hospital Bag', 'pregnancy'),
    ('Third Trimester', 'pregnancy'), ('Second Trimester', 'pregnancy'), ('First Trimester', 'pregnancy'), ('Prenatal Yoga', 'pregnancy'),
    ('Due Date', 'pregnancy'), ('Braxton Hicks', 'pregnancy'), ('Pregnancy Diet', 'pregnancy'), ('Constipation', 'pregnancy'),
    ('Headaches', 'pregnancy'), ('Mood Swings', 'pregnancy'), ('Food Cravings', 'pregnancy'), ('Weight Gain', 'pregnancy'),
    ('Coconut Water', 'food'), ('Dates', 'food'), ('Papaya', 'food'), ('Pineapple', 'food'), ('Saffron Milk', 'food'),
    ('Spinach', 'food'), ('Beetroot', 'food'), ('Almonds', 'food'), ('Ghee', 'food'), ('Curd', 'food'), ('Green Tea', 'food'),
    ('Mango', 'food'), ('Banana', 'food'), ('Ragi', 'food'), ('Sweet Potato', 'food'), ('Chickpeas', 'food'), ('Pomegranate', 'food'),
    ('Fennel Seeds', 'food'), ('Fenugreek', 'food'), ('Oats', 'food'), ('Moong Dal', 'food'), ('Paneer', 'food'), ('Eggs', 'food'),
    ('Baby Sleep Schedule', 'baby'), ('Teething', 'baby'), ('Colic', 'baby'), ('Diaper Rash', 'baby'), ('Baby Massage', 'baby'),
    ('Tummy Time', 'baby'), ('Baby Growth Chart', 'baby'), ('Vaccination Schedule', 'baby'), ('Starting Solids', 'baby'),
    ('Baby Food Chart', 'baby'), ('Cradle Cap', 'baby'), ('Baby Fever', 'baby'), ('Baby Cough', 'baby'), ('Baby Constipation', 'baby'),
    ('Crawling', 'baby'), ('First Words', 'baby'), ('Baby Hiccups', 'baby'), ('Separation Anxiety', 'baby'), ('Weaning', 'baby'),
    ('Baby Skin Care', 'baby'), ('Baby Weight Gain', 'baby'), ('Newborn Jaundice', 'baby'), ('Baby Bath', 'baby'),
    ('Breastfeeding', 'mother'), ('Postpartum Recovery', 'mother'), ('C-Section Recovery', 'mother'), ('Postpartum Hair Loss', 'mother'),
    ('Breast Milk Supply', 'mother'), ('Pumping', 'mother'), ('Postpartum Diet', 'mother'), ('Postpartum Exercise', 'mother'),
    ('Ovulation', 'ttc'), ('Fertility Diet', 'ttc'), ('PCOS', 'ttc'), ('Spotting After Conception', 'ttc'), ('Pregnancy Test', 'ttc'),
    ('Irregular Periods', 'ttc'), ('First Clues of Expecting', 'ttc'), ('Fertile Window', 'ttc'),
    ('Toddler Tantrums', 'toddler'), ('Potty Training', 'toddler'), ('Picky Eating', 'toddler'), ('Toddler Sleep', 'toddler'),
    ('Screen Time', 'toddler'), ('Speech Delay', 'toddler'), ('Toddler Snacks', 'toddler'),
]

PATTERNS = {
    'pregnancy': ['{t} During Pregnancy: Causes and Relief', '{t} in Pregnancy: What Every Mom Should Know',
                  '{n} Tips to Manage {t} While Pregnant', '{t}: A Week-by-Week Guide', 'Is {t} Normal in Pregnancy?'],
    'food': ['Can You Have {t} While Expecting?', '{n} Benefits of {t} for Pregnant Women', '{t} for Babies: When and How to Start',
             '{t} While Breastfeeding: Benefits and Risks', 'Healthy {t} Recipes for Kids'],
    'baby': ['{t}: A Complete Guide for New Parents', '{n} Things to Know About {t}', '{t} by Month: What to Expect',
             'How to Handle {t} at Home', '{t}: When to Call the Doctor'],
    'mother': ['{t}: Tips for New Moms', '{n} Ways to Help With {t}', '{t} After Delivery: What to Expect', 'A Simple Guide to {t}'],
    'ttc': ['{t}: Signs and What They Mean', 'How to Track {t}', '{n} Facts About {t}', '{t} and Your Chances of Conceiving'],
    'toddler': ['{n} Ways to Deal With {t}', '{t}: A Parent’s Guide', '{t} Ideas That Actually Work', 'When to Worry About {t}'],
}

QUERY_PATTERNS = {
    'pregnancy': ['{t} in pregnancy', '{t} during pregnancy', 'how to reduce {t} in pregnancy', '{t} pregnancy remedies', 'is {t} normal in pregnancy'],
    'food': ['{t} in pregnancy', 'can i have {t} while expecting', '{t} benefits for baby', '{t} for babies', '{t} while breastfeeding'],
    'baby': ['{t}', '{t} for babies', 'baby {t} remedies', '{t} by month', 'how to help baby with {t}'],
    'mother': ['{t}', '{t} tips', '{t} after delivery', 'how to improve {t}', '{t} for new moms'],
    'ttc': ['{t}', '{t} symptoms', 'how to track {t}', '{t} calculator', 'what is {t}'],
    'toddler': ['{t}', 'how to stop {t}', '{t} ideas', '{t} tips for parents', '{t} at 2 years'],
}

# Hindi versions (Devanagari) of a few generic topics; their encoded URLs are long, which is how cut-off URLs appear.
HINDI_TITLES = [
    'प्रेग्नेंसी में सुबह की मतली से राहत के आसान उपाय', 'प्रेग्नेंसी में कमर दर्द के कारण और घरेलू उपाय',
    'गर्भावस्था में नारियल पानी पीने के फायदे', 'गर्भावस्था में खजूर खाने के फायदे और नुकसान',
    'बच्चों के दांत निकलते समय क्या करें', 'नवजात शिशु की मालिश कैसे करें', 'शिशु के लिए आहार चार्ट महीने के अनुसार',
    'स्तनपान के दौरान क्या खाएं और क्या न खाएं', 'डिलीवरी के बाद बाल झड़ना कैसे रोकें', 'ओव्यूलेशन के लक्षण और पहचान',
    'माँ बनने के पहले संकेत क्या होते हैं', 'बच्चों में कब्ज के घरेलू उपाय', 'प्रेग्नेंसी में आयरन की कमी के लक्षण',
    'गर्भावस्था में पपीता खाना सुरक्षित है या नहीं', 'शिशु का टीकाकरण चार्ट', 'प्रेग्नेंसी में पैरों की सूजन कम करने के उपाय',
    'बच्चों को ठोस आहार कब देना शुरू करें', 'सिजेरियन डिलीवरी के बाद रिकवरी टिप्स', 'प्रेग्नेंसी डाइट चार्ट महीने के अनुसार',
    'गर्भावस्था में नींद की सही पोजीशन', 'शिशु के बुखार में क्या करें', 'प्रेग्नेंसी टेस्ट कब करना चाहिए',
]
# Titles that deliberately share a long opening, so several URLs get cut to the same 78 characters
HINDI_SHARED_START = 'गर्भावस्था में क्या खाना चाहिए और क्या नहीं'
HINDI_SHARED_ENDINGS = ['पहली तिमाही', 'दूसरी तिमाही', 'तीसरी तिमाही', 'पूरी सूची', 'डॉक्टर की सलाह']

OTHER_LANG_TITLES = {
    'ta': ['கர்ப்ப காலத்தில் உணவு முறை', 'குழந்தை தூக்க அட்டவணை', 'தாய்ப்பால் கொடுக்கும் போது உணவு', 'கர்ப்பகால முதுகு வலி'],
    'te': ['గర్భధారణ సమయంలో ఆహారం', 'శిశువు నిద్ర షెడ్యూల్', 'పాలిచ్చే తల్లుల ఆహారం'],
    'bn': ['গর্ভাবস্থায় খাদ্য তালিকা', 'শিশুর ঘুমের সময়সূচি', 'বুকের দুধ বাড়ানোর উপায়'],
    'mr': ['गरोदरपणात आहार कसा असावा', 'बाळाची झोप वेळापत्रक'],
}

HINDI_QUERIES = ['pregnancy me kya khana chahiye', 'garbhavastha me nariyal pani', 'bachon ke dant nikalne ke lakshan',
                 'pregnancy ke lakshan', 'delivery ke baad baal jhadna', 'stanpan me kya khaye', 'ovulation kab hota hai',
                 'pregnancy test kab kare', 'shishu ka tikakaran chart', 'pregnancy me kamar dard']

BABY_NAMES = ['Aarav', 'Anaya', 'Vihaan', 'Myra', 'Reyansh', 'Saanvi', 'Advik', 'Kiara', 'Ishaan', 'Aadhya', 'Kabir', 'Navya',
              'Arjun', 'Diya', 'Ayaan', 'Ira', 'Rudra', 'Siya', 'Atharv', 'Tara']
PRODUCTS = ['Organic Baby Lotion', 'Stretch Mark Cream', 'Baby Massage Oil', 'Nursing Pillow', 'Breast Pump', 'Baby Carrier',
            'Maternity Pillow', 'Diaper Rash Cream', 'Baby Wipes', 'Prenatal Vitamins']
CATEGORIES = ['Baby Care', 'Mom Care', 'Feeding', 'Diapering', 'Bath Time', 'Nursery']
TOOLS = ['Due Date Calculator', 'Fertile Days Planner', 'Baby Growth Tracker', 'Pregnancy Week Calculator', 'Baby Name Finder']

QA_QUESTIONS = [
    'Is it safe to {a} during pregnancy?', 'When should my baby start {b}?', 'How do I know if my baby is {c}?',
    'What helped you with {d}?', 'Can I {a} while breastfeeding?', 'How long does {d} last?', 'Any tips for {d}?',
]
QA_FILL = {
    'a': ['drink green tea', 'eat papaya', 'travel by plane', 'do yoga', 'eat pineapple', 'drink coffee', 'sleep on my back', 'take a hot bath'],
    'b': ['crawling', 'eating solids', 'talking', 'walking', 'sleeping through the night', 'drinking water', 'teething'],
    'c': ['getting enough milk', 'teething', 'too cold at night', 'gaining enough weight', 'ready for solids'],
    'd': ['morning sickness', 'colic', 'postpartum hair loss', 'back pain', 'baby hiccups', 'heartburn', 'sleep regression'],
}

# Section headings used for "sections added / removed" in the changelog
SECTIONS = ['Benefits', 'Risks', 'When to see a doctor', 'Home remedies', 'FAQs', 'How much is safe', 'Recipes', 'Expert tips',
            'Signs to watch for', 'Summary', 'Week by week', 'Myths and facts']

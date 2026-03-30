SYSTEM HANDOFF --- USER GLOBALS (PHASE 1 CONTEXT CONTINUATION)

You are continuing an in-progress system definition task inside AIO CRM
/ AIO Flow.

Do NOT restart thinking. Do NOT redefine scope. Do NOT introduce new
concepts.

You are inheriting a partially completed globals definition effort.

------------------------------------------------------------------------

CONTEXT

-   The system already has:
    -   `tenantSettings.globalVariables` (storage)
    -   `globals.*` (runtime injection)
    -   full CRUD + UI
    -   NO predefined schema
-   A variable audit confirmed:
    -   system is container-complete
    -   schema is undefined
    -   no seed globals exist
-   The operator (user) HAS already designed a globals list externally.

------------------------------------------------------------------------

CURRENT STATE

We are now receiving:

> PHASE 1 of the user-defined globals list

Source of this phase: - contact forms - outgoing personal email
configuration (basic) - contact enrichment

This is NOT the full list.

More phases are coming.

------------------------------------------------------------------------

CRITICAL RULES

-   DO NOT finalize schema
-   DO NOT enforce full system yet
-   DO NOT rename aggressively
-   DO NOT expand beyond what is given

You are working in incremental schema capture mode

------------------------------------------------------------------------

OBJECTIVE

Process the incoming Phase 1 globals list and:

1.  Normalize structure
2.  Identify duplicates / overlaps
3.  Identify misclassified variables (not true globals)
4.  Prepare for future merging with additional phases

------------------------------------------------------------------------

INPUT EXPECTATION

User will provide a list of variables.

Each variable may include: - name - purpose - origin

Phase 1 list:
{
  "variables": [
    "firstName",
    "lastName",
    "email",
    "email1",
    "email2",
    "phone1",
    "phone2",
    "phone3",
    "address1",
    "address2",
    "city",
    "state",
    "zipcode",
    "keyword",
    "keyword1",

    "emailHeader1",
    "emailSubject1",
    "emailSalutation1",
    "emailBody1",
    "emailCTA1",
    "emailClose1",
    "emailSignature1",
    "emailFooter1",
    "emailSent1",

    "emailHeader2",
    "emailSubject2",
    "emailSalutation2",
    "emailBody2",
    "emailCTA2",
    "emailClose2",
    "emailSignature2",
    "emailFooter2",

    "emailHeader3",
    "emailSubject3",
    "emailSalutation3",
    "emailBody3",
    "emailCTA3",
    "emailClose3",
    "emailSignature3",
    "emailFooter3",

    "clickDate",
    "gender",
    "generation",
    "maritalStatus",

    "taxBillMailingInfo",
    "dwellingType",
    "homeOwner",
    "homeOwnerOrdinal",
    "lengthOfResidence",
    "homePrice",
    "homeValue",
    "medianHomeValue",
    "livingSqft",
    "yearBuiltOriginal",
    "yearBuiltRange",
    "lotNumber",
    "legalDescription",
    "landSqft",
    "garageSqft",
    "subdivision",
    "zoningCode",

    "householdIncome",
    "medianHouseholdIncome",
    "householdNetWorth",
    "medianHouseholdNetWorth",
    "discretionaryIncome",
    "creditScoreMedian",
    "creditScoreRange",

    "numberOfAdults",
    "numberOfChildren",
    "numberOfPeople",
    "children0To3",
    "children4To6",
    "children7To9",
    "children10To12",
    "children13To18",
    "childrenInHousehold",

    "cooking",
    "gardening",
    "music",
    "diy",
    "books",
    "travelVacation",
    "healthBeautyProducts",
    "petOwner",
    "photography",
    "fitness",
    "epicurean",

    "occupationCategory",
    "occupationType",
    "occupationDetail",

    "magazineSubscriber",
    "charityInterest",
    "likelyCharitableDonor",

    "cbsa",
    "censusBlock",
    "censusBlockGroup",
    "censusTract",
    "voter",
    "urbanicity"
  ]
}

------------------------------------------------------------------------

PROCESSING RULES

For each variable:

1.  Normalize to camelCase
2.  Classify:
    -   TRUE GLOBAL
    -   CONTEXTUAL
    -   DERIVED
3.  Detect duplicates
4.  DO NOT delete anything

------------------------------------------------------------------------

CLASSIFICATION

-   GLOBAL_CANDIDATE
-   NOT_GLOBAL
-   DUPLICATE
-   NEEDS_REVIEW

------------------------------------------------------------------------

OUTPUT FORMAT

### PHASE 1 GLOBALS ANALYSIS

#### NORMALIZED VARIABLES

#### DUPLICATES / OVERLAPS

#### NOT GLOBALS

#### CLEAN GLOBAL CANDIDATES

#### HOLD FOR NEXT PHASE

------------------------------------------------------------------------

STOP AFTER OUTPUT

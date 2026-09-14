# Corella Bank fact ledger

Every concrete fact in the corpus, the value the corpus gives it, and the chunk ids where it appears. Use this when writing retrieval labels and test expectations. If a document changes, change this table in the same commit. All facts are fictional.

## Accounts and eligibility

| Fact | Value | Chunk ids |
|---|---|---|
| Everyday account monthly fee | $5, charged first day of month for previous month | fees-and-limits#everyday-account-fees, account-types#everyday-account |
| Everyday fee waiver | Deposit $1,000 or more in the calendar month; Saver transfers do not count | fees-and-limits#everyday-account-fees, account-types#everyday-account |
| Everyday interest | None | account-types#everyday-account, statements#interest-summary |
| Everyday accounts per customer | One in own name | account-types#everyday-account |
| Saver monthly fee | $0 | fees-and-limits#saver-account-fees, account-types#saver-account |
| Saver base rate | 0.10% per year | account-types#saver-account, fees-and-limits#saver-account-fees, closing-an-account#closing-a-saver-account |
| Saver bonus rate | 4.35% per year in months with $200 deposited and no withdrawals | account-types#saver-account, fees-and-limits#saver-account-fees |
| Saver interest paid | Calculated daily, paid last day of month | account-types#saver-account |
| Saver accounts per customer | Up to five | account-types#saver-account, opening-an-account#adding-a-saver-later |
| Saver has a card | No; money moves only via linked Everyday | account-types#saver-account, direct-debits#setting-up-a-direct-debit |
| Joint Everyday monthly fee | Single $5 fee shared, same $1,000 waiver | account-types#joint-everyday-account, joint-accounts#cards-and-fees-on-a-joint-account |
| Joint account holders | Exactly two, both already verified customers | joint-accounts#opening-a-joint-account, account-types#joint-everyday-account |
| Joint signing rules | Either-to-sign default; both-to-sign for transfers over $2,000 | joint-accounts#signing-rules, account-types#joint-everyday-account |
| Joint Saver | Not offered | account-types#joint-everyday-account, joint-accounts#opening-a-joint-account |
| Minimum age | 16 | account-types#who-can-open-an-account, opening-an-account#what-you-need-before-you-start |
| Residency | Australian resident with Australian residential address and mobile number | account-types#who-can-open-an-account, opening-an-account#what-you-need-before-you-start |
| Minimum opening deposit | None | opening-an-account#what-you-need-before-you-start |
| Sign up time | About five minutes | opening-an-account#overview |
| App passcode length | Six digits | opening-an-account#the-sign-up-steps, security-and-2fa#app-passcode-and-biometrics |

## Identity verification

| Fact | Value | Chunk ids |
|---|---|---|
| Automated verification time | About ten minutes | kyc-process#automated-verification, opening-an-account#the-sign-up-steps |
| Manual review time | Up to two business days | kyc-process#manual-review, opening-an-account#starter-limits-before-verification |
| Primary documents | Australian driver licence, unexpired passport, state proof of age card | kyc-documents#primary-photo-identification |
| Secondary documents | Medicare card, birth certificate, citizenship certificate, utility bill or rates notice under three months old | kyc-documents#secondary-documents |
| Secondary documents needed | At most one | kyc-documents#secondary-documents |
| Starter limits | Balance capped at $1,000, no international transfers, no card order | opening-an-account#starter-limits-before-verification |
| Verification attempts | Three, then paused and specialist contacts within one business day | kyc-process#if-verification-fails |
| Expired primary document grace | 60 days to upload a current one, then starter limits | kyc-process#ongoing-verification-checks |
| Privacy request response | Within 30 days | kyc-process#privacy-of-your-documents, closing-an-account#after-closure |
| Legal name change | Fresh primary document, up to two business days | kyc-documents#keeping-your-details-current |

## Cards

| Fact | Value | Chunk ids |
|---|---|---|
| Virtual card issue | Instant on verification, own number separate from physical | cards#virtual-card, opening-an-account#getting-your-account-details |
| Physical card delivery | Five to seven business days | cards#physical-card, opening-an-account#getting-your-account-details, card-replacement#standard-replacement |
| First physical card fee | $0 | cards#physical-card |
| Card PIN length | Four digits | cards#setting-and-changing-your-pin |
| Daily purchase limit | $5,000 across physical and virtual | cards#purchase-limits, fees-and-limits#card-and-atm-limits, card-controls#setting-a-lower-purchase-limit |
| Contactless PIN threshold | $200 | cards#purchase-limits, fees-and-limits#card-and-atm-limits, lockout-and-recovery#card-pin-lockout |
| Overseas purchase pricing | Mid market rate plus 0.5% margin, no separate international transaction fee | cards#using-the-card-overseas, foreign-exchange#how-the-rate-is-set |
| Lost card | Freeze first; report lost cancels permanently; free standard replacement | card-replacement#lost-card |
| Stolen card | Cancelled immediately, cannot be reinstated, flagged transactions auto-disputed, free standard replacement, police report if over $1,000 | card-replacement#stolen-card |
| Damaged card | First replacement in 12 months free, then $10 each | card-replacement#damaged-card, fees-and-limits#other-fees |
| Standard replacement | Free, five to seven business days, post | card-replacement#standard-replacement |
| Express replacement | $15 courier, two business days metro, three regional, street address only | card-replacement#express-replacement, fees-and-limits#other-fees |
| Freeze | Instant, free, blocks direct debits and subscriptions on the card too | card-controls#freezing-and-unfreezing |
| Blockable types | Online, overseas, gambling, ATM, contactless | card-controls#blocking-transaction-types |
| Turning off a block | Requires two factor approval | card-controls#blocking-transaction-types, security-and-2fa#two-factor-approval |
| Merchant lock | Blocks future charges from one merchant, does not reverse past charges | card-controls#merchant-locks |
| Decline notifications | Cannot be turned off | card-controls#notifications |

## ATMs and cash

| Fact | Value | Chunk ids |
|---|---|---|
| Corella Cash Network size | Around 3,200 ATMs | atm-access#corella-cash-network-atms |
| Network ATM withdrawal fee | $0 | atm-access#corella-cash-network-atms, fees-and-limits#card-and-atm-limits |
| Other Australian ATM fee | $2.50, up to three rebated per month | atm-access#other-australian-atms, fees-and-limits#card-and-atm-limits |
| Overseas ATM fee | $5 plus 0.5% margin | atm-access#overseas-atms, cards#using-the-card-overseas, fees-and-limits#card-and-atm-limits |
| Daily ATM withdrawal limit | $1,000, cannot be raised | atm-access#daily-withdrawal-limit, fees-and-limits#card-and-atm-limits |
| Cardless withdrawal code validity | 30 minutes | atm-access#cardless-withdrawals |
| Daily cash deposit limit | $3,000, free, network ATMs only | atm-access#depositing-cash |
| Cheques | Not accepted | atm-access#depositing-cash |

## Transfers and foreign exchange

| Fact | Value | Chunk ids |
|---|---|---|
| Domestic transfer daily limit | $10,000 default, raisable to $25,000 with two factor approval | fees-and-limits#domestic-transfer-limits, international-transfers#daily-limit |
| Domestic transfer fee | $0 | fees-and-limits#domestic-transfer-limits |
| International transfer daily limit | $5,000 default, raisable to $15,000 after a security call | fees-and-limits#international-transfer-limits, international-transfers#daily-limit |
| International transfer fee | $8 flat | international-transfers#fees-and-exchange-rate, fees-and-limits#international-transfer-limits |
| FX margin | 0.5% above mid market, same for cards and transfers | foreign-exchange#how-the-rate-is-set, international-transfers#fees-and-exchange-rate, cards#using-the-card-overseas |
| Countries and currencies | 48 countries, 20 currencies | international-transfers#where-you-can-send-money, foreign-exchange#supported-currencies |
| Rate lock | 60 seconds | foreign-exchange#rate-lock-on-transfers, international-transfers#fees-and-exchange-rate |
| International delivery time | One to three business days, up to five for some countries; same day processing before 3pm AEST | international-transfers#delivery-time |
| Free cancellation window | 30 minutes, before processing | international-transfers#cancelling-or-recalling-a-transfer |
| Recall fee | $25, not guaranteed | international-transfers#cancelling-or-recalling-a-transfer, fees-and-limits#other-fees |
| Weekend rates | Last mid market rate plus 0.5%, no surcharge | foreign-exchange#weekend-and-public-holiday-rates |
| Rate alerts | Up to ten active | foreign-exchange#rate-alerts |
| New payee two factor threshold | Over $1,000 same day | security-and-2fa#two-factor-approval |

## Disputes and chargebacks

| Fact | Value | Chunk ids |
|---|---|---|
| Card dispute lodgement window | 60 days from transaction date | disputes#when-to-lodge-a-dispute, chargeback-timelines#initial-review |
| Direct debit dispute window | 90 days from debit date | direct-debits#disputing-an-unauthorised-direct-debit, disputes#when-to-lodge-a-dispute |
| Provisional credit under $500 | Within five business days | disputes#provisional-credit |
| Provisional credit $500 or more | After initial investigation, up to ten business days | disputes#provisional-credit |
| Merchant disputes provisional credit | None; paid when upheld | disputes#provisional-credit |
| Initial review | Within two business days | chargeback-timelines#initial-review |
| Merchant response window | 30 days | chargeback-timelines#merchant-response-window |
| Resolution window | Up to 45 business days | chargeback-timelines#resolution-window |
| Reply to merchant evidence | Within seven days | chargeback-timelines#resolution-window |
| Escalation to complaints team | Within 30 days of decision; team responds within 30 days | chargeback-timelines#outcomes, chargeback-timelines#escalating-a-refused-dispute |
| Police report threshold | Unauthorised total over $1,000 | disputes#how-to-lodge-a-dispute, card-replacement#stolen-card |
| Direct debit dispute refund | Within five business days | direct-debits#disputing-an-unauthorised-direct-debit |

## Security and recovery

| Fact | Value | Chunk ids |
|---|---|---|
| Card PIN lockout | Three wrong attempts; unlock in app with two factor approval; does not expire | lockout-and-recovery#card-pin-lockout |
| App passcode lockout | Five wrong attempts locks 30 minutes; ten total locks account, call 1300 000 267 | lockout-and-recovery#app-passcode-lockout |
| Biometric fallback | Passcode required after restart, five failed biometric attempts, high risk actions | security-and-2fa#app-passcode-and-biometrics |
| Text code validity | Ten minutes, single use, fallback only | security-and-2fa#text-message-codes |
| New device sign in | Approve from old device, or text code plus liveness selfie | security-and-2fa#new-device-sign-in, lockout-and-recovery#lost-or-replaced-phone |
| Two factor actions | Raise limits, new payee over $1,000, change mobile, turn off block, new device, international limit increase | security-and-2fa#two-factor-approval |
| Bank never asks for | Passcode, PIN, text code, full card number; no safe accounts | security-and-2fa#keeping-your-account-safe, scam-reporting#reporting-impersonation-attempts |
| Scam report line | 1300 000 267, 24 hours | scam-reporting#how-to-report-a-scam, account-types#getting-help |
| Scam initial response | Case reference within two business days | scam-reporting#what-corella-bank-does-next |
| Scam reimbursement decision | In writing within 30 days | scam-reporting#reimbursement |

## Direct debits, statements, closing

| Fact | Value | Chunk ids |
|---|---|---|
| Direct debit cancellation | Blocked within one business day, free | direct-debits#cancelling-a-direct-debit, direct-debits#cancellation-fee |
| Dishonour fee | $7.50 | direct-debits#dishonour-fee, direct-debits#cancellation-fee, fees-and-limits#other-fees |
| Direct debit history shown | 13 months | direct-debits#viewing-your-direct-debits |
| Digital statements | Free, monthly on the first, kept seven years | statements#digital-statements |
| Paper statement fee | $2.50, posted within five business days | statements#paper-statements, fees-and-limits#other-fees |
| Exports | CSV or PDF, free, instant up to two years | statements#exporting-transactions |
| Interest summary | First week of July, Saver only | statements#interest-summary |
| Sole account closure | Balance $0 or nominated account, processed within two business days, free, Savers first | closing-an-account#closing-a-sole-account |
| Joint account closure | Both approve, seven day approval window, two business days after second approval | closing-an-account#closing-a-joint-account, joint-accounts#removing-a-holder-or-closing-a-joint-account |
| Saver closure | Instant, interest to linked Everyday, bonus forfeited for closing month | closing-an-account#closing-a-saver-account |
| Statements after closure | 90 days via chat, then privacy request up to 30 days | closing-an-account#after-closure, closing-an-account#before-you-close |
| Inactive marker | 12 months no customer transactions | closing-an-account#inactive-accounts |
| Unclaimed money transfer | 24 months | closing-an-account#inactive-accounts |
| Support hours | Chat 7am to 11pm AEST daily; phone 24 hours for lost or stolen cards and scams, otherwise 8am to 8pm AEST | account-types#getting-help |

## Distractor pairs

Chunks that share vocabulary but hold different facts. Retrieval labels for these list only the correct side.

| Pair | Chunk A | Chunk B |
|---|---|---|
| Everyday fee vs Saver fee | fees-and-limits#everyday-account-fees | fees-and-limits#saver-account-fees |
| Domestic vs international transfer limit | fees-and-limits#domestic-transfer-limits | fees-and-limits#international-transfer-limits |
| Standard vs express replacement | card-replacement#standard-replacement | card-replacement#express-replacement |
| Lost vs stolen card | card-replacement#lost-card | card-replacement#stolen-card |
| Dispute lodgement window vs chargeback resolution window | disputes#when-to-lodge-a-dispute | chargeback-timelines#resolution-window |
| Card dispute window vs direct debit dispute window | disputes#when-to-lodge-a-dispute | direct-debits#disputing-an-unauthorised-direct-debit |
| Card PIN lockout vs app passcode lockout | lockout-and-recovery#card-pin-lockout | lockout-and-recovery#app-passcode-lockout |
| Closing sole vs joint account | closing-an-account#closing-a-sole-account | closing-an-account#closing-a-joint-account |
| Dishonour fee vs cancellation fee | direct-debits#dishonour-fee | direct-debits#cancellation-fee |
| Network ATMs vs other Australian ATMs | atm-access#corella-cash-network-atms | atm-access#other-australian-atms |
| Digital vs paper statements | statements#digital-statements | statements#paper-statements |
| Damaged vs express replacement fee | card-replacement#damaged-card | card-replacement#express-replacement |

## Deliberately out of corpus

Home loans, business accounts, term deposits, cryptocurrency, share trading, credit cards, overdrafts, cheque books, branches, email support.

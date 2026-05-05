export const VAT_RATE = 0.18;
export const PRICE_INCLUDES_VAT = true;
export const CURRENCY = "ILS";

export const SALON_BUSINESS = {
    legalName: "Salon Tofik",
    displayName: "صالون توفيق",
    country: "Israel",
    currency: CURRENCY,
    vatRate: VAT_RATE,
    vatRateLabel: "18%",
    taxId: "TO_BE_CONFIGURED",
    vatFileNumber: "TO_BE_CONFIGURED",
    address: "TO_BE_CONFIGURED",
    phone: "+972-TO-BE-CONFIGURED",
    email: "privacy@salon-tofik.example"
};

export const PAYMENT_PROVIDER = {
    mode: "external_hosted_checkout",
    status: "prepared_for_provider",
    allowedProviders: ["Stripe", "PayPal", "Israeli hosted payment provider"],
    hostedCheckoutOnly: true,
    storesCreditCards: false,
    requiresHttps: true
};

export const INVOICE_PROVIDER = {
    status: "prepared_for_certified_israeli_provider",
    providerName: "TO_BE_CONFIGURED",
    apiEndpoint: "TO_BE_CONFIGURED",
    supportsVat: true,
    supportsAllocationNumber: true
};

export const ALLOCATION_NUMBER_INTEGRATION = {
    status: "prepared_for_tax_authority_api",
    number: null,
    requestId: null,
    required: "provider_or_accountant_to_decide",
    apiEndpoint: "TO_BE_CONFIGURED"
};

export const CANCELLATION_POLICY = {
    freeCancellationHours: 24,
    lateCancellationReview: true,
    noShowMayRequireDeposit: true
};

export function roundMoney(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function formatIls(value) {
    return `${roundMoney(value).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₪`;
}

export function calculateVatBreakdown(grossAmount, vatRate = VAT_RATE) {
    const gross = roundMoney(grossAmount);
    const net = PRICE_INCLUDES_VAT ? roundMoney(gross / (1 + vatRate)) : gross;
    const vat = roundMoney(gross - net);
    return {
        gross,
        net,
        vat,
        rate: vatRate,
        ratePercent: roundMoney(vatRate * 100),
        priceIncludesVat: PRICE_INCLUDES_VAT,
        currency: CURRENCY
    };
}

export function getPaymentSecurityStatus(locationLike = window.location) {
    const protocol = locationLike?.protocol || "";
    const hostname = locationLike?.hostname || "";
    const isLocal = ["localhost", "127.0.0.1", "::1", ""].includes(hostname) || protocol === "file:";
    const secure = protocol === "https:" || isLocal;
    return {
        secure,
        isLocal,
        message: secure
            ? "Secure hosted checkout is available for this environment."
            : "Online payment must run over HTTPS before redirecting to a hosted payment provider."
    };
}

export function buildInvoiceNumber(sourceId, date = new Date()) {
    const day = date.toISOString().slice(0, 10).replaceAll("-", "");
    const suffix = String(sourceId || Math.random().toString(16).slice(2)).slice(0, 8).toUpperCase();
    return `INV-${day}-${suffix}`;
}

export function normalizeInvoiceItems(items) {
    return (Array.isArray(items) ? items : []).map((item) => {
        const quantity = Math.max(1, Number(item.quantity || 1));
        const unitPriceGross = roundMoney(item.unitPriceGross ?? item.price ?? 0);
        const lineGross = roundMoney(unitPriceGross * quantity);
        const vat = calculateVatBreakdown(lineGross);
        return {
            name: item.name || "Item",
            productId: item.productId || item.id || "",
            quantity,
            unitPriceGross,
            lineGross,
            lineNet: vat.net,
            vatAmount: vat.vat,
            vatRate: vat.rate,
            priceIncludesVat: true
        };
    });
}

export function createPaymentRecordDraft({ sourceCollection, sourceId, customer, items, totalGross, acceptedPolicies }) {
    const now = new Date();
    const vat = calculateVatBreakdown(totalGross);
    return {
        sourceCollection,
        sourceId,
        customer: customer || {},
        items: normalizeInvoiceItems(items),
        amountGross: vat.gross,
        amountNet: vat.net,
        vatAmount: vat.vat,
        vatRate: vat.rate,
        currency: CURRENCY,
        priceIncludesVat: true,
        paymentProvider: PAYMENT_PROVIDER,
        paymentStatus: "pending_external_provider",
        hostedCheckoutStatus: "ready_to_redirect",
        noCreditCardDataStored: true,
        termsAccepted: !!acceptedPolicies?.terms,
        cancellationPolicyAccepted: !!acceptedPolicies?.cancellation,
        refundPolicyAccepted: !!acceptedPolicies?.refund,
        createdAt: now.toISOString(),
        createdAtMs: now.getTime(),
        retention: {
            keepForAccountingAudit: true,
            source: "Firestore PaymentRecords"
        }
    };
}

export function createInvoiceDraft({ sourceCollection, sourceId, customer, items, totalGross, paymentRecordId }) {
    const now = new Date();
    const vat = calculateVatBreakdown(totalGross);
    const invoiceItems = normalizeInvoiceItems(items);
    return {
        invoiceNumber: buildInvoiceNumber(sourceId, now),
        sourceCollection,
        sourceId,
        paymentRecordId,
        invoiceType: "tax_invoice_receipt_draft",
        invoiceStatus: "pending_certified_provider_sync",
        business: SALON_BUSINESS,
        customer: customer || {},
        items: invoiceItems,
        totals: {
            gross: vat.gross,
            net: vat.net,
            vat: vat.vat,
            vatRate: vat.rate,
            currency: CURRENCY,
            priceIncludesVat: true
        },
        invoiceProvider: INVOICE_PROVIDER,
        allocationNumber: ALLOCATION_NUMBER_INTEGRATION,
        issueDate: now.toISOString().slice(0, 10),
        createdAt: now.toISOString(),
        createdAtMs: now.getTime(),
        notes: "Draft record prepared for connection to an approved Israeli invoice provider. No credit card data is stored on this site."
    };
}

export function getAppointmentDateTime(appointment) {
    if (!appointment?.date) return null;
    const [year, month, day] = String(appointment.date).split("-").map(Number);
    if (!year || !month || !day) return null;
    const [hour = 23, minute = 59] = String(appointment.time || "23:59").split(":").map(Number);
    return new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0);
}

export function getCancellationAssessment(appointment, now = new Date()) {
    const appointmentDate = getAppointmentDateTime(appointment);
    const status = String(appointment?.status || "").toLowerCase();
    const alreadyCancelled = status.includes("cancel") || status.includes("إلغاء") || status.includes("בוטל");
    const isPast = appointmentDate ? appointmentDate <= now : true;
    const hoursBefore = appointmentDate ? (appointmentDate.getTime() - now.getTime()) / 36e5 : 0;
    const cancellable = !!appointmentDate && !alreadyCancelled && !isPast;
    const freeCancellation = cancellable && hoursBefore >= CANCELLATION_POLICY.freeCancellationHours;
    return {
        cancellable,
        alreadyCancelled,
        isPast,
        hoursBefore: roundMoney(hoursBefore),
        freeCancellation,
        policyWindowHours: CANCELLATION_POLICY.freeCancellationHours,
        refundStatus: freeCancellation ? "eligible_full_refund_if_paid" : "late_cancellation_review",
        cancellationFeeStatus: freeCancellation ? "no_fee" : "salon_review_required"
    };
}

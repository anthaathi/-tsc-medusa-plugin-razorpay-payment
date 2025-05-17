"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("@medusajs/framework/utils");
const types_1 = require("../types");
const update_razorpay_customer_metadata_1 = require("../../../workflows/update-razorpay-customer-metadata");
const get_smallest_unit_1 = require("../utils/get-smallest-unit");
const razorpay_1 = __importDefault(require("razorpay"));
class RazorpayBase extends utils_1.AbstractPaymentProvider {
    init() {
        const provider = this.options_.providers?.find((p) => p.id == RazorpayBase.identifier);
        if (!provider && !this.options_.key_id) {
            throw new utils_1.MedusaError(utils_1.MedusaErrorTypes.INVALID_ARGUMENT, "razorpay not configured", utils_1.MedusaErrorCodes.CART_INCOMPATIBLE_STATE);
        }
        this.razorpay_ =
            this.razorpay_ ||
                new razorpay_1.default({
                    key_id: this.options_.key_id ?? provider?.options.key_id,
                    key_secret: this.options_.key_secret ?? provider?.options.key_secret,
                    headers: {
                        "Content-Type": "application/json",
                        "X-Razorpay-Account": this.options_.razorpay_account ??
                            provider?.options.razorpay_account ??
                            undefined,
                    },
                });
    }
    constructor(container, options) {
        super(container, options);
        this.options_ = options;
        this.logger = container.logger;
        this.container_ = container;
        this.options_ = options;
        this.init();
    }
    static validateOptions(options) {
        if (!(0, utils_1.isDefined)(options.key_id)) {
            throw new Error("Required option `key_id` is missing in Razorpay plugin");
        }
        else if (!(0, utils_1.isDefined)(options.key_secret)) {
            throw new Error("Required option `key_secret` is missing in Razorpay plugin");
        }
    }
    buildError(message, e) {
        return {
            error: message,
            code: "code" in e ? e.code : "",
            detail: e.detail ?? e.message ?? "",
        };
    }
    async getRazorpayPaymentStatus(paymentIntent, attempts) {
        if (!paymentIntent) {
            return utils_1.PaymentSessionStatus.ERROR;
        }
        else {
            const authorisedAttempts = attempts.items.filter((i) => i.status == utils_1.PaymentSessionStatus.AUTHORIZED);
            const totalAuthorised = authorisedAttempts.reduce((p, c) => {
                p += parseInt(`${c.amount}`);
                return p;
            }, 0);
            return totalAuthorised == paymentIntent.amount
                ? utils_1.PaymentSessionStatus.CAPTURED
                : utils_1.PaymentSessionStatus.REQUIRES_MORE;
        }
    }
    async pollAndRetrieveCustomer(customer) {
        let customerList = [];
        let razorpayCustomer;
        const count = 10;
        let skip = 0;
        do {
            customerList = (await this.razorpay_.customers.all({
                count,
                skip,
            }))?.items;
            razorpayCustomer =
                customerList?.find((c) => c.contact == customer?.phone || c.email == customer.email) ?? customerList?.[0];
            if (razorpayCustomer) {
                await this.updateRazorpayMetadataInCustomer(customer, "rp_customer_id", razorpayCustomer.id);
                break;
            }
            if (!customerList || !razorpayCustomer) {
                throw new Error("no customers and cant create customers in razorpay");
            }
            skip += count;
        } while (customerList?.length == 0);
        return razorpayCustomer;
    }
    async fetchOrPollForCustomer(customer) {
        let razorpayCustomer;
        try {
            const rp_customer_id = customer.metadata?.razorpay?.rp_customer_id;
            if (rp_customer_id) {
                razorpayCustomer = await this.razorpay_.customers.fetch(rp_customer_id);
            }
            else {
                razorpayCustomer = await this.pollAndRetrieveCustomer(customer);
                this.logger.debug(`updated customer ${razorpayCustomer.email} with RpId :${razorpayCustomer.id}`);
            }
            return razorpayCustomer;
        }
        catch (e) {
            this.logger.error("unable to poll customer in the razorpay payment processor");
            return;
        }
    }
    async updateRazorpayMetadataInCustomer(customer, parameterName, parameterValue) {
        const metadata = customer.metadata;
        let razorpay = metadata?.razorpay;
        if (razorpay) {
            razorpay[parameterName] = parameterValue;
        }
        else {
            razorpay = {};
            razorpay[parameterName] = parameterValue;
        }
        const x = await (0, update_razorpay_customer_metadata_1.updateRazorpayCustomerMetadataWorkflow)(this.container_).run({
            input: {
                medusa_customer_id: customer.id,
                razorpay,
            },
        });
        const result = x.result.customer;
        return result;
        return customer;
    }
    async createRazorpayCustomer(customer, intentRequest, extra) {
        let razorpayCustomer;
        const phone = customer.phone ??
            extra.billing_address?.phone ??
            customer?.addresses.find((v) => v.phone != undefined)?.phone;
        const gstin = customer?.metadata?.gstin ?? undefined;
        if (!phone) {
            throw new Error("phone number to create razorpay customer");
        }
        if (!customer.email) {
            throw new Error("email to create razorpay customer");
        }
        const firstName = customer.first_name ?? "";
        const lastName = customer.last_name ?? "";
        try {
            const customerParams = {
                email: customer.email,
                contact: phone,
                gstin: gstin,
                fail_existing: 0,
                name: `${firstName} ${lastName} `,
                notes: {
                    updated_at: new Date().toISOString(),
                },
            };
            razorpayCustomer = await this.razorpay_.customers.create(customerParams);
            intentRequest.notes.razorpay_id = razorpayCustomer?.id;
            if (customer && customer.id) {
                await this.updateRazorpayMetadataInCustomer(customer, "rp_customer_id", razorpayCustomer.id);
            }
            return razorpayCustomer;
        }
        catch (e) {
            this.logger.error("unable to create customer in the razorpay payment processor");
            return;
        }
    }
    async editExistingRpCustomer(customer, intentRequest, extra) {
        let razorpayCustomer;
        const razorpay_id = intentRequest.notes?.razorpay_id ||
            customer.metadata?.razorpay_id ||
            customer.metadata?.razorpay?.rp_customer_id;
        try {
            razorpayCustomer = await this.razorpay_.customers.fetch(razorpay_id);
        }
        catch (e) {
            this.logger.warn("unable to fetch customer in the razorpay payment processor");
        }
        // edit the customer once fetched
        if (razorpayCustomer) {
            const editEmail = customer.email;
            const editName = `${customer.first_name} ${customer.last_name}`.trim();
            const editPhone = customer?.phone ||
                customer?.addresses.find((v) => v.phone != undefined)?.phone;
            try {
                const updateRazorpayCustomer = await this.razorpay_.customers.edit(razorpayCustomer.id, {
                    email: editEmail ?? razorpayCustomer.email,
                    contact: editPhone ?? razorpayCustomer.contact,
                    name: editName != "" ? editName : razorpayCustomer.name,
                });
                razorpayCustomer = updateRazorpayCustomer;
            }
            catch (e) {
                this.logger.warn("unable to edit customer in the razorpay payment processor");
            }
        }
        if (!razorpayCustomer) {
            try {
                razorpayCustomer = await this.createRazorpayCustomer(customer, intentRequest, extra);
            }
            catch (e) {
                this.logger.error("something is very wrong please check customer in the dashboard.");
            }
        }
        return razorpayCustomer; // returning un modified razorpay customer
    }
    async createOrUpdateCustomer(intentRequest, customer, extra) {
        let razorpayCustomer;
        try {
            const razorpay_id = customer.metadata?.razorpay?.rp_customer_id ||
                intentRequest.notes.razorpay_id;
            try {
                if (razorpay_id) {
                    this.logger.info("the updating  existing customer  in razorpay");
                    razorpayCustomer = await this.editExistingRpCustomer(customer, intentRequest, extra);
                }
            }
            catch (e) {
                this.logger.info("the customer doesn't exist in razopay");
            }
            try {
                if (!razorpayCustomer) {
                    this.logger.info("the creating  customer  in razopay");
                    razorpayCustomer = await this.createRazorpayCustomer(customer, intentRequest, extra);
                }
            }
            catch (e) {
                // if customer already exists in razorpay but isn't associated with a customer in medsusa
            }
            if (!razorpayCustomer) {
                try {
                    this.logger.info("relinking  customer  in razorpay by polling");
                    razorpayCustomer = await this.fetchOrPollForCustomer(customer);
                }
                catch (e) {
                    this.logger.error("unable to poll customer customer in the razorpay payment processor");
                }
            }
            return razorpayCustomer;
        }
        catch (e) {
            this.logger.error("unable to retrieve customer from cart");
        }
        return razorpayCustomer;
    }
    async initiatePayment(input) {
        this.logger.info(`[Razorpay] initiatePayment called with input: ${JSON.stringify(input)}`);
        const intentRequestData = this.getPaymentIntentOptions();
        const { currency_code, amount } = input;
        const { cart, notes, session_id } = input.data;
        if (!cart) {
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "cart not ready", utils_1.MedusaError.Codes.CART_INCOMPATIBLE_STATE);
        }
        const provider = this.options_.providers?.find((p) => p.id == RazorpayBase.identifier);
        if (!provider && !this.options_.key_id) {
            throw new utils_1.MedusaError(utils_1.MedusaErrorTypes.INVALID_ARGUMENT, "razorpay not configured", utils_1.MedusaErrorCodes.CART_INCOMPATIBLE_STATE);
        }
        const sessionNotes = notes ?? {};
        let toPay = (0, get_smallest_unit_1.getAmountFromSmallestUnit)(Math.round(Number(amount)), currency_code.toUpperCase());
        toPay = currency_code.toUpperCase() == "INR" ? toPay * 100 * 100 : toPay;
        const intentRequest = {
            amount: Math.round(toPay),
            currency: currency_code.toUpperCase(),
            notes: {
                ...sessionNotes,
                resource_id: session_id ?? "",
                session_id: session_id,
                cart_id: cart?.id,
            },
            payment: {
                capture: this.options_.auto_capture ?? provider?.options.auto_capture
                    ? "automatic"
                    : "manual",
                capture_options: {
                    refund_speed: this.options_.refund_speed ??
                        provider?.options.refund_speed ??
                        "normal",
                    automatic_expiry_period: Math.max(this.options_.automatic_expiry_period ??
                        provider?.options.automatic_expiry_period ??
                        20, 12),
                    manual_expiry_period: Math.max(this.options_.manual_expiry_period ??
                        provider?.options.manual_expiry_period ??
                        10, 7200),
                },
            },
            ...intentRequestData,
        };
        let session_data;
        const customerDetails = cart?.customer;
        try {
            const razorpayCustomer = await this.createOrUpdateCustomer(intentRequest, customerDetails, cart);
            try {
                if (razorpayCustomer) {
                    this.logger.debug(`the intent: ${JSON.stringify(intentRequest)}`);
                }
                else {
                    this.logger.error("unable to find razorpay customer");
                }
                const phoneNumber = razorpayCustomer?.contact ?? cart.billing_address?.phone;
                if (!phoneNumber) {
                    const e = new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "no phone number", utils_1.MedusaError.Codes.CART_INCOMPATIBLE_STATE);
                }
                session_data = await this.razorpay_.orders.create({
                    ...intentRequest,
                });
                this.logger.info(`Razorpay order created: ${JSON.stringify(session_data)}`);
            }
            catch (e) {
                new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, e, utils_1.MedusaError.Codes.UNKNOWN_MODULES);
            }
        }
        catch (e) {
            new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, e, utils_1.MedusaError.Codes.UNKNOWN_MODULES);
        }
        this.logger.info(`[Razorpay] Returning payment session: ${JSON.stringify({
            id: session_data?.id,
            data: { ...session_data, intentRequest }
        })}`);
        return {
            id: session_data?.id,
            data: { ...session_data, intentRequest: intentRequest },
        };
    }
    async authorizePayment(input) {
        this.logger.info(`[Razorpay] authorizePayment input: ${JSON.stringify(input)}`);
        // 1. Extract orderId
        const orderId = typeof input.data?.id === "string" ? input.data.id : undefined;
        if (!orderId) {
            this.logger.error("[Razorpay] authorizePayment failed: order_id is missing or not a string in session data.");
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "Razorpay order_id is missing or not a string in payment session data.");
        }
        this.logger.info(`[Razorpay] Using order_id: ${orderId}`);
        // 2. Fetch and log the order (optional, for context)
        let razorpayOrder;
        try {
            razorpayOrder = await this.razorpay_.orders.fetch(orderId);
            this.logger.info(`[Razorpay] Fetched order: ${JSON.stringify(razorpayOrder)}`);
        }
        catch (err) {
            this.logger.error(`[Razorpay] Error fetching order from Razorpay: ${err?.message || err}`);
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to fetch order from Razorpay.");
        }
        // 3. Fetch and log payments for this order
        let payments;
        try {
            payments = await this.razorpay_.orders.fetchPayments(orderId);
            this.logger.info(`[Razorpay] Payments for order ${orderId}: ${JSON.stringify(payments)}`);
            payments.items.forEach((payment) => {
                this.logger.info(`[Razorpay] Payment ID: ${payment.id}, Status: ${payment.status}`);
            });
        }
        catch (err) {
            this.logger.error(`[Razorpay] Error fetching payments for order ${orderId}: ${err?.message || err}`);
            throw new utils_1.MedusaError(utils_1.MedusaError.Types.UNEXPECTED_STATE, "Failed to fetch payments for order from Razorpay.");
        }
        // 4. Check if any payment is authorized or captured
        const authorizedPayment = payments.items.find((p) => p.status === "authorized" || p.status === "captured");
        if (authorizedPayment) {
            this.logger.info(`[Razorpay] Found authorized/captured payment: ${authorizedPayment.id}`);
            return {
                status: "authorized",
                data: {
                    ...razorpayOrder,
                    payment: authorizedPayment,
                    order_id: orderId,
                },
            };
        }
        else {
            this.logger.warn(`[Razorpay] No authorized or captured payment found for order ${orderId}.`);
            return {
                status: "pending",
                data: {
                    ...razorpayOrder,
                    payments: payments.items,
                    reason: "No authorized/captured payment yet. Check logs for payment status.",
                },
            };
        }
    }
    async capturePayment(input) {
        this.logger.info(`[Razorpay] capturePayment input: ${JSON.stringify(input)}`);
        // Type guard to check if input.data is RazorpaySessionData
        function isRazorpaySessionData(data) {
            return (typeof data === "object" &&
                data !== null &&
                "id" in data &&
                typeof data.id === "string");
        }
        if (!isRazorpaySessionData(input.data)) {
            this.logger.error("[Razorpay] capturePayment failed: order_id is missing or data is not valid RazorpaySessionData.");
            throw new Error("Razorpay order_id is missing in payment session data.");
        }
        const order_id = input.data.id;
        this.logger.info(`[Razorpay] Using order_id: ${order_id}`);
        // ...rest of your logic, using input.data as RazorpaySessionData
        const paymentsResponse = await this.razorpay_.orders.fetchPayments(order_id);
        this.logger.info(`[Razorpay] Payments for order ${order_id}: ${JSON.stringify(paymentsResponse.items)}`);
        const possibleCaptures = paymentsResponse.items?.filter((item) => item.status === "authorized");
        if (!possibleCaptures || possibleCaptures.length === 0) {
            this.logger.error(`[Razorpay] No authorized payments found for order ${order_id}`);
            throw new Error("No authorized payments to capture.");
        }
        const payments = [];
        for (const payment of possibleCaptures) {
            const { id, amount, currency } = payment;
            const toPay = (0, get_smallest_unit_1.getAmountFromSmallestUnit)(Math.round(parseInt(amount.toString())), currency.toUpperCase()) * 100;
            this.logger.info(`[Razorpay] Capturing payment ${id} for amount ${toPay} ${currency}`);
            const paymentIntent = await this.razorpay_.payments.capture(id, toPay, currency);
            this.logger.info(`[Razorpay] Payment captured: ${JSON.stringify(paymentIntent)}`);
            payments.push(paymentIntent);
        }
        input.payments = payments;
        return {
            data: { ...input, intentRequest: input },
        };
    }
    async getPaymentStatus(paymentSessionData) {
        const id = paymentSessionData?.data?.id;
        let paymentIntent;
        let paymentsAttempted;
        try {
            paymentIntent = await this.razorpay_.orders.fetch(id);
            paymentsAttempted = await this.razorpay_.orders.fetchPayments(id);
        }
        catch (e) {
            this.logger.warn("received payment data from session not order data");
            paymentIntent = await this.razorpay_.orders.fetch(id);
            paymentsAttempted = await this.razorpay_.orders.fetchPayments(id);
        }
        switch (paymentIntent.status) {
            // created' | 'authorized' | 'captured' | 'refunded' | 'failed'
            case "created":
                return {
                    status: utils_1.PaymentSessionStatus.REQUIRES_MORE,
                    data: {
                        ...paymentSessionData,
                        intentRequest: paymentSessionData,
                    },
                };
            case "paid":
                return {
                    status: utils_1.PaymentSessionStatus.AUTHORIZED,
                    data: {
                        ...paymentSessionData,
                        intentRequest: paymentSessionData,
                    },
                };
            case "attempted":
                return {
                    status: await this.getRazorpayPaymentStatus(paymentIntent, paymentsAttempted),
                    data: {
                        ...paymentSessionData,
                        intentRequest: paymentSessionData,
                    },
                };
            default:
                return {
                    status: utils_1.PaymentSessionStatus.PENDING,
                    data: {
                        ...paymentSessionData,
                        intentRequest: paymentSessionData,
                    },
                };
        }
    }
    getPaymentIntentOptions() {
        const options = {};
        if (this?.paymentIntentOptions?.capture_method) {
            options.capture_method = this.paymentIntentOptions.capture_method;
        }
        if (this?.paymentIntentOptions?.setup_future_usage) {
            options.setup_future_usage = this.paymentIntentOptions.setup_future_usage;
        }
        if (this?.paymentIntentOptions?.payment_method_types) {
            options.payment_method_types =
                this.paymentIntentOptions.payment_method_types;
        }
        return options;
    }
    async deletePayment(input) {
        return await this.cancelPayment(input);
    }
    async cancelPayment(input) {
        const error = {
            error: "Unable to cancel as razorpay doesn't support cancellation",
            code: types_1.ErrorCodes.UNSUPPORTED_OPERATION,
        };
        return {
            data: {
                error,
            },
        };
    }
    async refundPayment(input) {
        this.logger.info(`[Razorpay] refundPayment called with input: ${JSON.stringify(input)}`);
        const { data, amount } = input;
        const id = data.id;
        const paymentList = await this.razorpay_.orders.fetchPayments(id);
        const payment_id = paymentList.items?.find((p) => {
            return (parseInt(`${p.amount}`) >= Number(amount) * 100 &&
                (p.status == "authorized" || p.status == "captured"));
        })?.id;
        if (payment_id) {
            const refundRequest = {
                amount: Number(amount) * 100,
            };
            try {
                const refundSession = await this.razorpay_.payments.refund(payment_id, refundRequest);
                const refundsIssued = data?.refundSessions;
                if (refundsIssued?.length > 0) {
                    refundsIssued.push(refundSession);
                }
                else {
                    if (data) {
                        data.refundSessions = [refundSession];
                    }
                }
                this.logger.info(`[Razorpay] Refund issued: ${JSON.stringify(refundSession)}`);
            }
            catch (e) {
                new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, e, utils_1.MedusaError.Codes.UNKNOWN_MODULES);
            }
        }
        return { data };
    }
    async retrievePayment(paymentSessionData) {
        let intent;
        try {
            const id = paymentSessionData
                .id;
            intent = await this.razorpay_.orders.fetch(id);
        }
        catch (e) {
            const id = paymentSessionData
                .order_id;
            try {
                intent = await this.razorpay_.orders.fetch(id);
            }
            catch (e) {
                new utils_1.MedusaError(utils_1.MedusaError.Types.INVALID_DATA, "An error occurred in retrievePayment", utils_1.MedusaError.Codes.UNKNOWN_MODULES);
            }
        }
        return {
            data: {
                ...intent,
            },
        };
    }
    async updatePayment(input) {
        const { amount, currency_code, context } = input;
        const { customer } = context ?? {};
        const { billing_address } = customer ?? {};
        if (!billing_address) {
            throw new utils_1.MedusaError(utils_1.MedusaErrorTypes.INVALID_DATA, "An error occurred in updatePayment during the retrieve of the cart", utils_1.MedusaErrorCodes.CART_INCOMPATIBLE_STATE);
        }
        let refreshedCustomer;
        let customerPhone = "";
        let razorpayId;
        if (customer) {
            try {
                refreshedCustomer = input.context?.customer;
                razorpayId = refreshedCustomer?.metadata?.razorpay
                    ?.rp_customer_id;
                customerPhone =
                    refreshedCustomer?.phone ?? billing_address?.phone ?? "";
                if (!refreshedCustomer.addresses.find((v) => v.id == billing_address?.id)) {
                    this.logger.warn("no customer billing found");
                }
            }
            catch {
                throw new utils_1.MedusaError(utils_1.MedusaErrorTypes.INVALID_DATA, "An error occurred in updatePayment during the retrieve of the customer", utils_1.MedusaErrorCodes.CART_INCOMPATIBLE_STATE);
            }
        }
        const isNonEmptyPhone = customerPhone || billing_address?.phone || customer?.phone || "";
        if (!razorpayId) {
            throw new utils_1.MedusaError(utils_1.MedusaErrorTypes.INVALID_DATA, "razorpay id not supported", utils_1.MedusaErrorCodes.CART_INCOMPATIBLE_STATE);
        }
        if (razorpayId !== customer?.id) {
            const phone = isNonEmptyPhone;
            if (!phone) {
                this.logger.warn("phone number wasn't specified");
                throw new utils_1.MedusaError(utils_1.MedusaErrorTypes.INVALID_DATA, "An error occurred in updatePayment during the retrieve of the customer", utils_1.MedusaErrorCodes.CART_INCOMPATIBLE_STATE);
            }
            const result = await this.initiatePayment(input);
            // TODO: update code block
            if (!result) {
                throw new utils_1.MedusaError(utils_1.MedusaErrorTypes.INVALID_DATA, "An error occurred in updatePayment during the initiate of the new payment for the new customer", utils_1.MedusaErrorCodes.CART_INCOMPATIBLE_STATE);
            }
            return result;
        }
        else {
            if (!amount) {
                throw new utils_1.MedusaError(utils_1.MedusaErrorTypes.INVALID_DATA, "amount  not valid", utils_1.MedusaErrorCodes.CART_INCOMPATIBLE_STATE);
            }
            if (!currency_code) {
                throw new utils_1.MedusaError(utils_1.MedusaErrorTypes.INVALID_DATA, "currency code not known", utils_1.MedusaErrorCodes.CART_INCOMPATIBLE_STATE);
            }
            try {
                const id = input.data.id;
                let sessionOrderData = {
                    currency: "INR",
                };
                if (id) {
                    sessionOrderData = (await this.razorpay_.orders.fetch(id));
                    delete sessionOrderData.id;
                    delete sessionOrderData.created_at;
                }
                input.currency_code =
                    currency_code?.toUpperCase() ?? sessionOrderData?.currency ?? "INR";
                const newPaymentSessionOrder = (await this.initiatePayment(input));
                return { data: { ...newPaymentSessionOrder.data } };
            }
            catch (e) {
                throw new utils_1.MedusaError(utils_1.MedusaErrorTypes.INVALID_DATA, "An error occurred in updatePayment", utils_1.MedusaErrorCodes.CART_INCOMPATIBLE_STATE);
            }
        }
    }
    async getWebhookActionAndData(webhookData) {
        const webhookSignature = webhookData.headers["x-razorpay-signature"];
        const webhookSecret = this.options_?.webhook_secret ||
            process.env.RAZORPAY_WEBHOOK_SECRET ||
            process.env.RAZORPAY_TEST_WEBHOOK_SECRET;
        const logger = this.logger;
        const data = webhookData.data;
        logger.info(`Received Razorpay webhook body as object : ${JSON.stringify(webhookData.data)}`);
        try {
            const validationResponse = razorpay_1.default.validateWebhookSignature(webhookData.rawData.toString(), webhookSignature, webhookSecret);
            // return if validation fails
            if (!validationResponse) {
                return { action: utils_1.PaymentActions.FAILED };
            }
        }
        catch (error) {
            logger.error(`Razorpay webhook validation failed : ${error}`);
            return { action: utils_1.PaymentActions.FAILED };
        }
        const paymentData = webhookData.data
            .payload?.payment?.entity;
        const event = data.event;
        const order = await this.razorpay_.orders.fetch(paymentData.order_id);
        /** sometimes this even fires before the order is updated in the remote system */
        const outstanding = (0, get_smallest_unit_1.getAmountFromSmallestUnit)(order.amount_paid == 0 ? paymentData.amount : order.amount_paid, paymentData.currency.toUpperCase());
        switch (event) {
            // payment authorization is handled in checkout flow. webhook not needed
            case "payment.captured":
                return {
                    action: utils_1.PaymentActions.SUCCESSFUL,
                    data: {
                        session_id: paymentData.notes.session_id,
                        amount: outstanding,
                    },
                };
            case "payment.authorized":
                return {
                    action: utils_1.PaymentActions.AUTHORIZED,
                    data: {
                        session_id: paymentData.notes.session_id,
                        amount: outstanding,
                    },
                };
            case "payment.failed":
                // TODO: notify customer of failed payment
                return {
                    action: utils_1.PaymentActions.FAILED,
                    data: {
                        session_id: paymentData.notes.session_id,
                        amount: outstanding,
                    },
                };
                break;
            default:
                return { action: utils_1.PaymentActions.NOT_SUPPORTED };
        }
    }
}
RazorpayBase.identifier = "razorpay";
exports.default = RazorpayBase;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmF6b3JwYXktYmFzZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uL3NyYy9wcm92aWRlcnMvcmF6b3JwYXkvY29yZS9yYXpvcnBheS1iYXNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBQUEscURBUW1DO0FBNkJuQyxvQ0FRa0I7QUFDbEIsNEdBQThHO0FBQzlHLGtFQUF1RTtBQUN2RSx3REFBZ0M7QUFtQmhDLE1BQWUsWUFBYSxTQUFRLCtCQUF1QjtJQU0vQyxJQUFJO1FBQ1osTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUM1QyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxZQUFZLENBQUMsVUFBVSxDQUN2QyxDQUFDO1FBRUYsSUFBSSxDQUFDLFFBQVEsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDdkMsTUFBTSxJQUFJLG1CQUFXLENBQ25CLHdCQUFnQixDQUFDLGdCQUFnQixFQUNqQyx5QkFBeUIsRUFDekIsd0JBQWdCLENBQUMsdUJBQXVCLENBQ3pDLENBQUM7UUFDSixDQUFDO1FBQ0QsSUFBSSxDQUFDLFNBQVM7WUFDWixJQUFJLENBQUMsU0FBUztnQkFDZCxJQUFJLGtCQUFRLENBQUM7b0JBQ1gsTUFBTSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxJQUFJLFFBQVEsRUFBRSxPQUFPLENBQUMsTUFBTTtvQkFDeEQsVUFBVSxFQUFFLElBQUksQ0FBQyxRQUFRLENBQUMsVUFBVSxJQUFJLFFBQVEsRUFBRSxPQUFPLENBQUMsVUFBVTtvQkFDcEUsT0FBTyxFQUFFO3dCQUNQLGNBQWMsRUFBRSxrQkFBa0I7d0JBQ2xDLG9CQUFvQixFQUNsQixJQUFJLENBQUMsUUFBUSxDQUFDLGdCQUFnQjs0QkFDOUIsUUFBUSxFQUFFLE9BQU8sQ0FBQyxnQkFBZ0I7NEJBQ2xD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
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const razorpay_base_1 = __importDefault(require("../core/razorpay-base"));
const types_1 = require("../types");
class RazorpayService extends razorpay_base_1.default {
    constructor(_, options) {
        super(_, options);
    }
    get paymentIntentOptions() {
        return {};
    }
}
RazorpayService.identifier = types_1.PaymentProviderKeys.RAZORPAY;
exports.default = RazorpayService;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmF6b3JwYXktcHJvdmlkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi9zcmMvcHJvdmlkZXJzL3Jhem9ycGF5L3NlcnZpY2VzL3Jhem9ycGF5LXByb3ZpZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBQUEsMEVBQWlEO0FBQ2pELG9DQUFxRTtBQUVyRSxNQUFNLGVBQWdCLFNBQVEsdUJBQVk7SUFHeEMsWUFBWSxDQUFDLEVBQUUsT0FBTztRQUNwQixLQUFLLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ3BCLENBQUM7SUFFRCxJQUFJLG9CQUFvQjtRQUN0QixPQUFPLEVBQVMsQ0FBQztJQUNuQixDQUFDOztBQVJNLDBCQUFVLEdBQUcsMkJBQW1CLENBQUMsUUFBUSxDQUFDO0FBV25ELGtCQUFlLGVBQWUsQ0FBQyJ9
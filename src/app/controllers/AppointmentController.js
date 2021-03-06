// importar o Yup para fazer validação
import * as Yup from 'yup';
// Importar tres metodos do date-fns e não a biblioteca toda
import { startOfHour, parseISO, isBefore, format, subHours } from 'date-fns';
import pt from 'date-fns/locale/pt';
// Importar o model de ususarios
import User from '../models/User';
// Importar o model de File
import File from '../models/File';
//  Importar o model de appointment
import Appointment from '../models/Appointment';
//
import Notification from '../schemas/Notification';
//
import CancellationEmail from '../jobs/CancellationMail';
import Queue from '../../lib/Queue';

// criar classe AppointmentController
class AppointmentController {
  // Listagem de agendamentos (utiliza-se o index por padrão)
  async index(req, res) {
    // Pega o page de req.query (se não for informado, por padrão é igual a 1)
    const { page = 1 } = req.query;
    // Criar variavel appoitments que guarda a procura de todos registros
    const appointments = await Appointment.findAll({
      // Onde os user-id é igual a req.userId e agendamentos não cancelados
      where: { user_id: req.userId, canceled_at: null },
      // Ordenar os agendamentos por data
      order: ['date'],
      // Definir quais ados serão mostrados
      attributes: ['id', 'date', 'past', 'cancelable'],
      // Listar 20 registros por vez
      limit: 20,
      // Calculo de quantos registros se pula por pagina
      offset: (page - 1) * 20,
      // Incluir dados do prestador de serviços
      include: [
        {
          model: User,
          // Como tem dois relacionamentos o "as" é obrigatorio
          as: 'provider',
          // Definir quais ados serão mostrados
          attributes: ['id', 'name'],
          // Incluir o avatar
          include: [
            {
              model: File,
              as: 'avatar',
              // Definir quais ados serão mostrados
              attributes: ['id', 'path', 'url'],
            },
          ],
        },
      ],
    });
    // Retorna os agendamentos
    return res.json(appointments);
  }

  // Criar metodo store, que recebe req e res e retorna alguma coisa
  async store(req, res) {
    // Definir um schema de validação com o Yup
    const schema = Yup.object().shape({
      // No req.boby os campos obrigatorios serão
      provider_id: Yup.number().required(),
      date: Yup.date().required(),
    });

    if (!(await schema.isValid(req.body))) {
      return res.status(400).json({ error: 'Validation fails' });
    }

    const { provider_id, date } = req.body;

    /**
     *  Check if provider_id is a provider
     */
    // Encontrar um registro (findOne) com as condições (where)
    const checkIsProvider = await User.findOne({
      // Um registro onde o registro do usuario seja provider_id e o provider seja true
      where: { id: provider_id, provider: true },
    });
    // Se não encontrar nenhum usuario (false)
    if (!checkIsProvider) {
      // Retorna uma mensagem de erro
      return res
        .status(401)
        .json({ error: 'You can only create appointments with providers' });
    }
    /**
     * Check for past dates
     */
    // Armazenar em hourstart a hora de inicio(despreza minutos), atraves da função startofhour
    // após a conversão de hora pelo parseiso para o formato que javascript entende
    const hourStart = startOfHour(parseISO(date));
    // Verificação se o hourStart esta antes de new Date (ou seja data atual)
    if (isBefore(hourStart, new Date())) {
      // Se a data já passou retorna mensagem de erro
      return res.status(400).json({ error: 'Past dates are not permitted' });
    }

    /**
     * Check date availability
     */
    // Procura um agendamento onde
    const checkAvailability = await Appointment.findOne({
      where: {
        provider_id, // O provider_id seja o provider_id do agendamento
        canceled_at: null, // Se houver cancelamento de agendamento a data esta disponivel
        date: hourStart,
      },
    });

    if (checkAvailability) {
      // Se encontrou o checkAvailability, então o horario não esta vago e retorna mensagem de erro
      return res
        .status(400)
        .json({ error: 'Appointment date is not available' });
    }

    // Se o usuario é um provider, cria-se o agendamento
    const appointment = await Appointment.create({
      // Dados a serem enviados para marcar o agendamento
      user_id: req.userId, // req.userId é setado automaticamente quando o usuario faz login
      provider_id, // Campo pego do req.body
      date: hourStart,
    });

    /**
     *  Notify appointment provider
     */
    const user = await User.findByPk(req.userId);
    const formattedDate = format(
      hourStart,
      "'dia' dd 'de' MMMM', as' H:mm'h'",
      { locale: pt }
    );

    await Notification.create({
      content: `Novo agendamento de ${user.name} para ${formattedDate}`,
      user: provider_id,
    });

    return res.json(appointment);
  }

  async delete(req, res) {
    // Buscar dados do agendamento
    const appointment = await Appointment.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'provider',
          attributes: ['name', 'email'],
        },
        {
          model: User,
          as: 'user',
          attributes: ['name'],
        },
      ],
    });
    // Verificar se o id do usuario do agendamento é diferente do usuario logado
    if (appointment.user_id !== req.userId) {
      return res.status(401).json({
        error: "You don't have permission to cancel this appointment.",
      });
    }
    // Armazena o horario com duas horas a menos do horario do agendamento
    const dateWithSub = subHours(appointment.date, 2);
    // Verifica o horario de cancelamento e menor que a hora atual
    if (isBefore(dateWithSub, new Date())) {
      return res.status(401).json({
        error: 'You can only cancel appointments 2 hours in advance.',
      });
    }
    // Ataulizar o campo canceled_at para a data atual
    appointment.canceled_at = new Date();

    await appointment.save();

    await Queue.add(CancellationEmail.key, {
      appointment,
    });

    return res.json(appointment);
  }
}
// Export padrão
export default new AppointmentController();
